
import React from 'react';
import { Heart, Clock, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWeb3 } from '@/hooks/useWeb3';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { useNavigate } from 'react-router-dom';
import { nftService } from '@/services/nftService';
import { apiUrl } from '@/config';

interface NFTCardProps {
  title: string;
  collection: string | { name: string; slug?: string; image_url?: string };
  price: string;
  image: string;
  tokenId?: number | string;
  liked?: boolean;
  isAuction?: boolean;
  timeLeft?: string;
  views?: number;
  onLike?: (liked: boolean) => void;
  afterBuy?: () => void;
  id?: string | number;
  owner_address?: string;
  is_listed?: boolean;
  canLike?: boolean; // <-- add this
  source?: string; // <-- add this
}

const getImageUrl = (url: string) => {
  if (!url) return url;
  // Strip any extra query params
  const clean = url.split('?')[0];
  if (clean.startsWith('ipfs://')) {
    return clean.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return clean;
};

const NFTCard = ({ 
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
  is_listed,
  canLike = true, // <-- default true
  source,
}: NFTCardProps) => {
  const { buyNFT, listNFT } = useWeb3();
  const { address } = useWallet();
  const [isBuying, setIsBuying] = React.useState(false);
  const [isListing, setIsListing] = React.useState(false);
  const [isLiking, setIsLiking] = React.useState(false);
  const navigate = useNavigate();

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
      liked
    });
  }, [title, collection, price, image, tokenId, id, liked]);

  const handleLike = async () => {
    if (isLiking) {
      console.log('[NFTCard] Like already in progress, ignoring click');
      return;
    }
    
    if (!id || !address) {
      toast.error('NFT ID or wallet address not found');
      return;
    }
    
    setIsLiking(true);
    console.log('[NFTCard] Toggling like for NFT:', id, 'Current liked state:', liked);
    try {
      // Let parent component handle the API call
      if (onLike) {
        onLike(!liked); // Pass the expected new state (opposite of current)
      }
    } catch (err) {
      console.error('[NFTCard] Like failed:', err);
      toast.error('Failed to update like');
    } finally {
      setIsLiking(false);
    }
  };

  const handleBuy = async () => {
    if (!tokenId || !price) {
      toast.error('Missing tokenId or price');
      return;
    }
    if (isOwner) {
      toast.error('You already own this NFT.');
      return;
    }
    if (!is_listed) {
      toast.error('This NFT is not listed for sale.');
      return;
    }
    setIsBuying(true);
    console.log('[NFTCard] Attempting to buy NFT:', { tokenId, price });
    try {
      // Try on-chain buy if wallet is available; otherwise fall back to simulation
      let txHash = '';
      let simulated = false;
      if (address && window.ethereum) {
        console.log('[NFTCard] Calling buyNFT...');
        const result = await buyNFT(Number(tokenId), price.toString());
        console.log('[NFTCard] buyNFT result:', result);
        if (result && result.hash) {
          txHash = result.hash;
          toast.success('NFT purchased successfully!');
        } else {
          toast.message('Proceeding with simulated transfer for testing.');
          simulated = true;
        }
      } else {
        toast.message('No wallet detected. Proceeding with simulated transfer for testing.');
        simulated = true;
      }

      // Notify backend to update owner (supports simulation if new_owner is provided)
      try {
        const payload: any = {
          transaction_hash: txHash,
          price: price,
          block_number: 0,
          gas_used: 0,
          gas_price: 0,
        };
        if (simulated && address) payload.new_owner = address;
        await fetch(apiUrl(`/nfts/${tokenId}/transfer/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success('Ownership updated.');
        if (afterBuy) afterBuy();
      } catch (err) {
        console.error('[NFTCard] Failed to notify backend for activity log:', err);
      }
    } catch (err: any) {
      console.error('Transaction error:', err);
      if (err?.reason === 'NFT not listed for sale' || err?.message?.includes('NFT not listed for sale')) {
        toast.error('This NFT is not listed for sale.');
      } else if (err?.reason === 'Incorrect price' || err?.message?.includes('Incorrect price')) {
        toast.error('Incorrect price for this NFT.');
      } else if (err?.code === 'INSUFFICIENT_FUNDS' || err?.message?.includes('insufficient funds')) {
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
      } else {
        toast.error('Transaction failed: ' + (err?.message || 'Unknown error'));
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

  const isOwner = address && owner_address && address.toLowerCase() === owner_address.toLowerCase();

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
              console.error('[NFTCard] Image failed to load:', (e.target as HTMLImageElement).src);
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVDwvdGV4dD48L3N2Zz4=';
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
            <Heart className={`h-4 w-4 transition-colors ${liked ? 'fill-red-500 text-red-500' : 'hover:text-red-500'}`} />
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
