
import React, { useState } from 'react';
import { Heart, Clock, Eye } from 'lucide-react';
import { ethers } from 'ethers';
import { useLikes } from '@/contexts/LikeContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWeb3 } from '@/hooks/useWeb3';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { useNavigate } from 'react-router-dom';
import { nftService } from '@/services/nftService';
import { apiUrl, NETWORK_CONFIG, mediaUrl } from '@/config';

interface NFTCardProps {
  title: string;
  collection: string | { name: string; slug?: string; image_url?: string };
  price: string | number;
  image: string;
  tokenId?: number | string;
  liked?: boolean | undefined;
  isAuction?: boolean;
  timeLeft?: string;
  views?: number;
  onLike?: (liked: boolean) => void;
  afterBuy?: () => void;
  id?: string | number;
  owner_address?: string;
  is_listed?: boolean;
  canLike?: boolean;
  source?: string;
}

const getImageUrl = (url: string) => {
  if (!url) return url;
  
  // Strip any extra query params
  const clean = url.split('?')[0];
  
  if (clean.startsWith('ipfs://')) {
    // Remove any trailing slashes
    const ipfsHash = clean.replace('ipfs://', '').replace(/\/+$/, '');
    // Try multiple IPFS gateways in case one is down
    // You can also consider using Cloudflare, Pinata, or your own gateway
    const gateway = 'https://ipfs.io/ipfs/';
    return `${gateway}${ipfsHash}`;
  }

  // Handle base64 images
  if (clean.startsWith('data:')) {
    return clean;
  }

  // Handle HTTP/HTTPS URLs or localhost fallbacks by returning normalized media URL
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return mediaUrl(clean);
  }

  // If it's just a hash, assume it's an IPFS hash
  if (clean.match(/^Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58}|B[A-Z2-7]{58}|z[1-9A-HJ-NP-Za-km-z]{48}|F[0-9A-F]{50}$/i)) {
    return `https://ipfs.io/ipfs/${clean}`;
  }

  // Resolve any relative paths (e.g., /media/...) through API base
  return mediaUrl(clean);
};

const NFTCard: React.FC<NFTCardProps> = ({ 
  title, 
  collection, 
  price, 
  image, 
  tokenId,
  liked = false, 
  isAuction = false,
  timeLeft,
  views,
  onLike,
  afterBuy,
  id,
  owner_address,
  is_listed = false,
  canLike = true,
  source,
}) => {
  // Hooks
  const navigate = useNavigate();
  const { buyNFT, listNFT } = useWeb3();
  const { address } = useWallet();
  const { isLiked, toggleLike } = useLikes();

  // State
  const [isBuying, setIsBuying] = useState(false);
  const [isListing, setIsListing] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  // Derived state
  const isOwner = address && owner_address && address.toLowerCase() === owner_address.toLowerCase();

  // Debug: Log props on mount
  React.useEffect(() => {
    console.log('[NFTCard] Rendered with props:', {
      title,
      collection,
      price,
      image,
      imageUrl: getImageUrl(image),
      tokenId,
      id,
      id_type: typeof id,
      liked,
      isOwner
    });
  }, [title, collection, price, image, tokenId, id, liked, isOwner]);

  const handleLike = async () => {
    if (isLiking || !id || !address) return;
    setIsLiking(true);
    try {
      // Single source of truth: update via LikeContext only
      await toggleLike(id);
    } catch (err) {
      console.error('[NFTCard] Like failed:', err);
      toast.error('Failed to update like');
    } finally {
      setIsLiking(false);
    }
  };

  const handleBuy = async () => {
    if (!tokenId || !price) {
      toast.error('Please try again. NFT information is missing.');
      return;
    }
    if (isOwner) {
      toast.error('You already own this NFT.');
      return;
    }
    if (!is_listed) {
      toast.error('This NFT is not currently listed for sale.');
      return;
    }
    if (!address) {
      toast.error('Please connect your wallet to make a purchase.');
      return;
    }
    if (!window.ethereum) {
      toast.error('Please install a Web3 wallet (like MetaMask) to purchase NFTs.');
      return;
    }

    setIsBuying(true);
    console.log('[NFTCard] Attempting to buy NFT:', { tokenId, price });
    
    let simulated = false;

    try {
      // Ensure we're on Sepolia network
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const network = await web3Provider.getNetwork();
      
      if (network.chainId !== BigInt(NETWORK_CONFIG.chainIdDecimal)) {
        toast.loading('Switching to Sepolia network...', { id: 'network-switch' });
        const { switchToSepoliaNetwork } = await import('@/config');
        const switched = await switchToSepoliaNetwork();
        if (!switched) {
          toast.error('Please switch to the Sepolia Test Network to continue.', { id: 'network-switch' });
          return;
        }
        toast.success('Successfully switched to Sepolia network!', { id: 'network-switch' });
      }

      // Check balance
      const balance = await web3Provider.getBalance(address);
      const priceInWei = ethers.parseEther(price.toString());
      
      if (balance < priceInWei) {
        toast.error('Insufficient balance in your wallet to complete this purchase.');
        return;
      }

      // Proceed with purchase
      console.log('[NFTCard] Calling buyNFT...');
      const result = await buyNFT(Number(tokenId), price.toString());
      console.log('[NFTCard] buyNFT result:', result);
      
      if (!result || !result.hash) {
        toast.error('Transaction failed to process. Please try again.');
        return;
      }

      // Transaction successful
      const txHash = result.hash;
      toast.success('Purchase successful! Updating ownership...');

      // Notify backend to update owner (pass new_owner to avoid race with chain indexing)
      try {
        const payload: any = {
          transaction_hash: txHash,
          price: price,
          block_number: 0,
          gas_used: 0,
          gas_price: 0,
        };
        if (address) payload.new_owner = address;
        
        await fetch(apiUrl(`/nfts/${tokenId}/transfer/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success('Ownership updated.');
        if (afterBuy) afterBuy();
        // As a fallback when parent does not pass afterBuy, refresh the page data
        if (!afterBuy) {
          try { window.dispatchEvent(new Event('visibilitychange')); } catch {}
        }
      } catch (backendError) {
        console.error('[NFTCard] Failed to notify backend for activity log:', backendError);
        toast.error('Purchase completed but ownership update failed. Please refresh.');
      }

    } catch (error: any) {
      console.error('Transaction error:', error);
      
      if (error?.message?.includes('insufficient funds') || error?.code === 'INSUFFICIENT_FUNDS') {
        // Allow user to simulate purchase for testing
        try {
          toast.message('Insufficient funds. Proceeding with simulated transfer for testing.');
          await fetch(apiUrl(`/nfts/${tokenId}/transfer/`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_owner: address, transaction_hash: `simulated_${tokenId}`, price })
          });
          toast.success('Ownership updated (simulated).');
          if (afterBuy) afterBuy();
        } catch (e) {
          toast.error('Simulation failed.');
        }
      } else if (error?.message?.includes('user rejected')) {
        toast.error('Purchase was cancelled.');
      } else if (error?.message?.includes('NFT not listed') || error?.reason === 'NFT not listed for sale') {
        toast.error('This NFT is not listed for sale.');
      } else if (error?.message?.includes('Incorrect price') || error?.reason === 'Incorrect price') {
        toast.error('The price of this NFT has changed. Please refresh the page.');
      } else {
        toast.error('Transaction failed: ' + (error?.message || 'Unknown error'));
      }
    } finally {
      setIsBuying(false);
    }
  };

  const handleListNFT = async () => {
    if (!tokenId || !price) {
      toast.error('Missing tokenId or price');
      return;
    }
    if (!address) {
      toast.error('Please connect your wallet first.');
      return;
    }
    if (!window.ethereum) {
      toast.error('No Ethereum provider found.');
      return;
    }

    setIsListing(true);
    try {
      console.log('[NFTCard] Attempting to list NFT:', { tokenId, price });
      const result = await listNFT(Number(tokenId), price.toString());
      console.log('[NFTCard] List NFT result:', result);
      if (result && result.hash) {
        // Notify backend for activity logging
        try {
          await fetch(apiUrl(`/nfts/${tokenId}/transfer/`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transaction_hash: result.hash,
              price: price,
              block_number: result.blockNumber || 0,
              gas_used: result.gasUsed || 0,
              gas_price: result.gasPrice || 0
            })
          });
        } catch (err) {
          console.error('[NFTCard] Failed to notify backend for activity log:', err);
        }
        // Call backend to set is_listed = true only if on-chain listing succeeded
        try {
          const resp = await fetch(apiUrl(`/nfts/${tokenId}/set_listed/`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = await resp.json();
          if (data.success) {
            toast.success('NFT listed successfully!');
          } else {
            toast.error('Listed on-chain, but backend update failed: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          toast.error('Listed on-chain, but backend update failed.');
        }
      } else {
        toast.error('Listing transaction failed or was rejected.');
      }
    } catch (err: any) {
      console.error('[NFTCard] List NFT failed:', err);
      if (err && err.message) {
        toast.error('Failed to list NFT: ' + err.message);
      } else {
        toast.error('Failed to list NFT');
      }
    } finally {
      setIsListing(false);
    }
  };

  // Debug logging
  console.log('[NFTCard] Debug values:', {
    tokenId,
    title,
    address: address?.toLowerCase(),
    owner_address: owner_address?.toLowerCase(),
    isOwner,
    is_listed,
    price
  });

  // Handler for card click
  const handleCardClick = async (e: React.MouseEvent) => {
    // Prevent navigation if clicking on a button or interactive element
    if ((e.target as HTMLElement).closest('button,svg,a,input')) return;
    if (id) {
      try {
        await fetch(apiUrl(`/nfts/${id}/track-view/`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            viewer_address: window.ethereum?.selectedAddress || null
          })
        });
      } catch (error) {
        console.error('[NFTCard] Failed to track view:', error);
      }
      navigate(`/nft/${id}`);
    }
  };

  return (
    <Card
      className="group overflow-hidden border-0 bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full flex flex-col min-w-0 cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {/* Display image or media poster */}
        {image && (image.includes('mt=video') || image.includes('mt=audio')) ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
            {image.includes('mt=video') ? 'Video NFT' : 'Audio NFT'}
          </div>
        ) : (
          <img 
            src={getImageUrl(image)} 
            alt={title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              const currentSrc = img.src;
              console.error('[NFTCard] Image failed to load:', currentSrc);
              
              // If we're using ipfs.io and it failed, try alternate IPFS gateways
              if (currentSrc.includes('ipfs.io')) {
                if (currentSrc.includes('/ipfs/')) {
                  const hash = currentSrc.split('/ipfs/')[1];
                  // Try cloudflare-ipfs.com
                  img.src = `https://cloudflare-ipfs.com/ipfs/${hash}`;
                  return;
                }
              }
              
              // If all gateways fail, show placeholder
              img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVDwvdGV4dD48L3N2Zz4=';
            }}
            onLoad={() => console.log('[NFTCard] Image loaded successfully:', getImageUrl(image))}
          />
        )}
        <div className="absolute top-3 right-3 flex space-x-2">
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-8 w-8 p-0 bg-background/80 backdrop-blur hover:bg-background"
            onClick={e => { e.stopPropagation(); handleLike(); }}
            disabled={isLiking || !canLike}
            title={canLike ? "Like this NFT" : "Only local NFTs can be liked"}
          >
            <Heart className={`h-4 w-4 transition-colors ${id && isLiked(id) ? 'fill-red-500 text-red-500' : 'hover:text-red-500'}`} />
          </Button>
          {views && (
            <div className="flex items-center space-x-1 bg-background/80 backdrop-blur rounded-md px-2 py-1">
              <Eye className="h-3 w-3" />
              <span className="text-xs">{views}</span>
            </div>
          )}
        </div>
        {isAuction && timeLeft && (
          <div className="absolute bottom-3 left-3">
            <Badge variant="destructive" className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span className="text-xs">{timeLeft}</span>
            </Badge>
          </div>
        )}
      </div>
      
      <CardContent className="p-4 flex-1 flex flex-col">
        <div className="space-y-3 flex-1">
          <p className="text-sm text-muted-foreground truncate">
            {typeof collection === 'string' ? collection : collection?.name || 'Unknown Collection'}
          </p>
          <h3 className="font-semibold text-lg leading-tight overflow-hidden" style={{ 
            display: '-webkit-box', 
            WebkitLineClamp: 2, 
            WebkitBoxOrient: 'vertical',
            minHeight: '3rem'
          }}>{title}</h3>
          <div className="flex items-center justify-between gap-2 mt-auto">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="font-bold text-lg flex items-center truncate">
                <span className="text-xs mr-1 flex-shrink-0">Ξ</span>
                <span className="truncate">{price}</span>
              </p>
            </div>
            <div className="flex-shrink-0">
              {/* Button rendering logic */}
              {isAuction ? (
                <Button variant="outline" size="sm" className="whitespace-nowrap text-xs px-2">
                  Place Bid
                </Button>
              ) : (
                <>
                  {isOwner && !is_listed && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-purple-500 to-blue-600 whitespace-nowrap text-xs px-2"
                      disabled
                      title="You own this NFT"
                    >
                      Owned
                    </Button>
                  )}
                  {isOwner && is_listed && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-purple-500 to-blue-600 whitespace-nowrap text-xs px-2"
                      disabled
                      title="You cannot buy your own NFT"
                    >
                      Owned
                    </Button>
                  )}
                  {!isOwner && !is_listed && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-gray-400 to-gray-600 whitespace-nowrap text-xs px-2"
                      disabled
                      title="This NFT is not for sale"
                    >
                      Not for Sale
                    </Button>
                  )}
                  {!isOwner && is_listed && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-purple-500 to-blue-600 whitespace-nowrap text-xs px-2"
                      onClick={handleBuy}
                      disabled={isBuying}
                      title="Buy Now"
                    >
                      {isBuying ? 'Buying...' : 'Buy Now'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NFTCard;
