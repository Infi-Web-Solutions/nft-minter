
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
import { collateralLendingService } from '@/services/collateralLendingService';
import { apiUrl, NETWORK_CONFIG } from '@/config';
import { ethers } from 'ethers';


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
  canLike?: boolean;
  source?: string;
  onClick?: () => void; // Add custom onClick handler
  loanStatus?: string;
  loanBorrower?: string;
  loanLender?: string;
  onRequestLoan?: () => void;
  disableRequestLoan?: boolean;
  isWrapped?: boolean;
  isRentable?: boolean;
  onRent?: () => void;
  loanId?: string;
  isRented?: boolean;
  onReturn?: () => void;
  onSubLease?: () => void;
  nftType?: 'NFT' | 'Rent' | 'wNFT' | 'wwNFT' | 'For Sale' | 'Auction' | 'Rented' | 'For Rent';
}

const getImageUrl = (url: string) => {
  if (!url) return url;
  // Strip any extra query params
  const clean = url.split('?')[0];

  if (clean.startsWith('ipfs://')) {
    // Handle ipfs://ipfs/HASH and ipfs://HASH
    const hash = clean.replace('ipfs://', '').replace('ipfs/', '');
    return `https://gateway.pinata.cloud/ipfs/${hash}`;
  }

  // Handle cases where the URL might be a gateway URL but we want to standardize
  // This ensures we always start with our primary gateway (Pinata) and fallback from there
  if (clean.includes('/ipfs/')) {
    const hash = clean.split('/ipfs/')[1];
    if (hash) {
      return `https://gateway.pinata.cloud/ipfs/${hash}`;
    }
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
  canLike = true,
  source,
  onClick,
  loanStatus,
  loanBorrower,
  onRequestLoan,
  disableRequestLoan = false,
  isWrapped = false,
  isRentable = false,
  isRented = false,
  onRent,
  loanId,
  loanLender,
  onReturn,
  onSubLease,
  nftType = 'NFT',
}: NFTCardProps) => {
  const { buyNFT, listNFT } = useWeb3();
  const { address, provider } = useWallet();
  const [isBuying, setIsBuying] = React.useState(false);
  const [isListing, setIsListing] = React.useState(false);
  const [isLiking, setIsLiking] = React.useState(false);
  const navigate = useNavigate();

  const isOwner = address && owner_address?.toLowerCase() === address.toLowerCase();
  const isLoanBorrower = address && loanBorrower && address.toLowerCase() === loanBorrower.toLowerCase();
  const isLoanLender = address && loanLender && address.toLowerCase() === loanLender.toLowerCase();

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

      // Handle user rejection
      if (err?.code === 4001 ||
        err?.code === 'ACTION_REJECTED' ||
        err?.message?.includes('User denied') ||
        err?.message?.includes('user rejected')) {
        toast.error('Transaction cancelled by user');
        return;
      }

      // Handle insufficient funds
      if (err?.code === 'INSUFFICIENT_FUNDS' || err?.message?.includes('insufficient funds')) {
        toast.error('Insufficient funds in your wallet');
        return;
      }

      if (err && err.message) {
        toast.error('Failed to list NFT: ' + err.message);
      } else {
        toast.error('Failed to list NFT');
      }
    } finally {
      setIsListing(false);
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

  const handleFundLoan = async () => {
    if (!address || !provider) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!loanId) {
      toast.error('Loan ID is missing');
      return;
    }

    try {
      toast.loading('Funding Loan...');

      // Initialize service
      await collateralLendingService.initialize(provider);

      // Fund loan
      // We don't need to pass price anymore, the service fetches the exact principal from chain
      await collateralLendingService.fundLoan(Number(loanId));

      // Update backend status
      await fetch(apiUrl(`/loans/${loanId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Funded',
          lender: address,
          startTime: Math.floor(Date.now() / 1000)
        })
      });

      toast.dismiss();
      toast.success('Loan Funded Successfully!');

      if (afterBuy) afterBuy();

    } catch (error: any) {
      console.error('Error funding loan:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to fund loan');
    }
  };


  // Handler for card click
  const handleCardClick = async (e: React.MouseEvent) => {
    // Prevent navigation if clicking on a button or interactive element
    if ((e.target as HTMLElement).closest('button,svg,a,input')) return;

    // For wrapped leasing tokens shown in marketplace/profile, always go to wNFT detail page
    if (isWrapped && tokenId !== undefined && tokenId !== null) {
      navigate(`/wnft/${tokenId}`);
      return;
    }

    // Default: regular NFT detail page using combined ID
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

  // Determine effective badge type based on loan status
  let displayBadge = nftType;
  if (loanStatus === 'Requested') {
    displayBadge = 'Loan Request' as any;
  } else if (loanStatus === 'Funded') {
    displayBadge = 'Loan Active' as any;
  }

  // Helper to get badge color
  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'Rent': return 'bg-green-600 hover:bg-green-700'; // Legacy support
      case 'For Rent': return 'bg-green-600 hover:bg-green-700';
      case 'Rented': return 'bg-red-600 hover:bg-red-700';
      case 'Auction': return 'bg-orange-600 hover:bg-orange-700';
      case 'For Sale': return 'bg-blue-600 hover:bg-blue-700';
      case 'wNFT': return 'bg-purple-600 hover:bg-purple-700';
      case 'wwNFT': return 'bg-indigo-600 hover:bg-indigo-700';
      case 'Loan Request': return 'bg-pink-600 hover:bg-pink-700';
      case 'Loan Active': return 'bg-amber-600 hover:bg-amber-700';
      default: return 'bg-gray-600 hover:bg-gray-700'; // NFT
    }
  };

  return (
    <Card
      className="group overflow-hidden border-0 bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full flex flex-col min-w-0 cursor-pointer"
      onClick={onClick || handleCardClick}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {/* NFT Type Badge */}
        <div className="absolute top-3 left-3 z-10">
          <Badge className={`${getBadgeColor(displayBadge)} text-white border-0`}>
            {displayBadge}
          </Badge>
        </div>

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
            onError={async (e) => {
              const img = e.target as HTMLImageElement;
              const currentSrc = img.src;
              console.warn('[NFTCard] Image failed to load:', currentSrc);

              // List of gateways to try in order
              const gateways = [
                'https://gateway.pinata.cloud/ipfs/',
                'https://dweb.link/ipfs/',
                'https://cloudflare-ipfs.com/ipfs/',
                'https://nftstorage.link/ipfs/',
                'https://ipfs.io/ipfs/'
              ];

              // Extract hash from current URL
              let hash = '';

              // Try to find /ipfs/ in the URL
              const ipfsIndex = currentSrc.indexOf('/ipfs/');
              if (ipfsIndex !== -1) {
                hash = currentSrc.substring(ipfsIndex + 6);
              }

              if (!hash) {
                console.warn('[NFTCard] Could not extract hash from URL:', currentSrc);
                // Fallback to placeholder immediately if no hash found
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVDwvdGV4dD48L3N2Zz4=';
                return;
              }

              // Determine which gateway we just tried
              const currentGateway = gateways.find(gw => currentSrc.startsWith(gw));
              let nextGatewayIndex = 0;

              if (currentGateway) {
                nextGatewayIndex = gateways.indexOf(currentGateway) + 1;
              }

              if (nextGatewayIndex < gateways.length) {
                const nextGateway = gateways[nextGatewayIndex];
                console.log(`[NFTCard] Retrying with next gateway: ${nextGateway}`);
                img.src = `${nextGateway}${hash}`;
              } else {
                console.warn('[NFTCard] All gateways exhausted. Checking if this is metadata JSON...');

                // Try to fetch it as JSON, maybe it's metadata?
                try {
                  // Use the first gateway (Pinata) for this check as it's most reliable
                  const metadataUrl = `https://gateway.pinata.cloud/ipfs/${hash}`;
                  const response = await fetch(metadataUrl);
                  if (response.ok) {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                      const metadata = await response.json();
                      if (metadata.image) {
                        console.log('[NFTCard] Found image in metadata JSON:', metadata.image);
                        // Recursively use getImageUrl to handle the new IPFS URI
                        img.src = getImageUrl(metadata.image);
                        return;
                      }
                    }
                  }
                } catch (err) {
                  console.error('[NFTCard] Failed to check metadata:', err);
                }

                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVDwvdGV4dD48L3N2Zz4=';
              }
            }}
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
        {isRentable && !isOwner && (
          <div className="absolute bottom-3 left-3">
            {/* <Badge className="bg-green-600 hover:bg-green-700 flex items-center space-x-1">
              <span className="text-xs"></span>
            </Badge> */}
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
                  {isWrapped && (
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        className="bg-purple-500/80 whitespace-nowrap text-xs px-2 cursor-not-allowed w-full"
                        disabled
                        title="This NFT is currently wrapped"
                      >
                        Wrapped
                      </Button>
                      {/* {onReturn && (
                        <Button
                          size="sm"
                          className="bg-red-500 hover:bg-red-600 whitespace-nowrap text-xs px-2 w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReturn();
                          }}
                          title="Return this NFT to the owner"
                        >
                          Return
                        </Button>
                      )} */}
                      {onSubLease && (
                        <Button
                          size="sm"
                          className="bg-blue-500 hover:bg-blue-600 whitespace-nowrap text-xs px-2 w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSubLease();
                          }}
                          title="List this wrapped NFT for rent"
                        >
                          Sub-lease
                        </Button>
                      )}
                    </div>
                  )}

                  {loanStatus === 'Requested' && !isOwner && !isWrapped && (
                    <Button
                      size="sm"
                      className={`${isLoanBorrower ? "bg-blue-500 hover:bg-blue-600" : "bg-green-600 hover:bg-green-700"} text-white whitespace-nowrap text-xs px-2`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFundLoan();
                      }}
                      title={isLoanBorrower ? "You have requested a loan for this NFT" : "Click to fund this loan"}
                    >
                      {isLoanBorrower ? "Requested Loan" : "Fund Loan"}
                    </Button>
                  )}
                  {loanStatus === 'Requested' && isOwner && !isWrapped && (
                    <Button
                      size="sm"
                      className={`${isLoanBorrower ? "bg-blue-500 hover:bg-blue-600" : "bg-green-600 hover:bg-green-700"} text-white whitespace-nowrap text-xs px-2`}
                      // onClick={(e) => {
                      //   e.stopPropagation();
                      //   navigate('/lending');
                      // }}
                      title={isLoanBorrower ? "You have requested a loan for this NFT" : "Click to fund this loan"}
                    >
                      Requested Loan
                    </Button>
                  )}

                  {/* NFT is actively loaned - show collateral badge instead of buy button */}
                  {loanStatus === 'Funded' && !isWrapped && (
                    <Button
                      size="sm"
                      className={`${(isLoanBorrower || isLoanLender) ? "bg-blue-600 hover:bg-blue-700 cursor-pointer" : "bg-orange-500/80 cursor-not-allowed"} whitespace-nowrap text-xs px-2`}
                      disabled={!isLoanBorrower && !isLoanLender}
                      onClick={(e) => {
                        if ((isLoanBorrower || isLoanLender) && onRequestLoan) {
                          e.stopPropagation();
                          onRequestLoan();
                        }
                      }}
                      title={isLoanBorrower ? "Click to repay loan" : (isLoanLender ? "Click to manage loan" : "This NFT is currently used as loan collateral")}
                    >
                      {isLoanBorrower ? "Repay Loan" : (isLoanLender ? "Manage Loan" : "🔒 Collateral")}
                    </Button>
                  )}

                  {loanStatus !== 'Requested' && loanStatus !== 'Funded' && isOwner && !isWrapped && !isRentable && (
                    <Button
                      size="sm"
                      className={`whitespace-nowrap text-xs px-2 text-white ${(disableRequestLoan || !onRequestLoan) ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!disableRequestLoan && onRequestLoan) onRequestLoan();
                      }}
                      disabled={disableRequestLoan || !onRequestLoan}
                      title={(disableRequestLoan || !onRequestLoan) ? "Loan requests are disabled here" : "Request a loan using this NFT as collateral"}
                    >
                      Request Loan
                    </Button>
                  )}
                  {loanStatus !== 'Requested' && loanStatus !== 'Funded' && isOwner && isRentable && !isRented && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap text-xs px-2 text-white"
                      onClick={(e) => {
                        console.log('Manage Listing Button Clicked');
                        e.stopPropagation();
                        if (onRent) {
                          console.log('Calling onRent');
                          onRent();
                        } else {
                          console.log('onRent is undefined');
                        }
                      }}
                      title="Manage your rental listing"
                    >
                      Listed for Rent
                    </Button>
                  )}
                  {loanStatus !== 'Requested' && loanStatus !== 'Funded' && isOwner && isRentable && isRented && (
                    <Button
                      size="sm"
                      className="bg-orange-500 cursor-not-allowed whitespace-nowrap text-xs px-2 text-white"
                      disabled
                      title="This NFT is currently rented out"
                    >
                      Rented Out
                    </Button>
                  )}

                  {loanStatus !== 'Requested' && loanStatus !== 'Funded' && !isOwner && !is_listed && !isWrapped && !isRentable && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-gray-400 to-gray-600 whitespace-nowrap text-xs px-2"
                      disabled
                      title="This NFT is not for sale"
                    >
                      Not for Sale
                    </Button>
                  )}
                  {loanStatus !== 'Requested' && loanStatus !== 'Funded' && !isOwner && !isRentable && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-purple-500 to-blue-600 whitespace-nowrap text-xs px-2 mr-1"
                      onClick={handleBuy}
                      disabled={isBuying}
                      title="Buy Now"
                    >
                      {isBuying ? 'Buying...' : 'Buy Now'}
                    </Button>
                  )}

                  {/* Rent Button */}
                  {/* Rent Button */}
                  {isRentable && !isOwner && !isWrapped && (
                    <Button
                      size="sm"
                      className={`${isRented ? "bg-orange-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"} whitespace-nowrap text-xs px-2 ml-1`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isRented && onRent) onRent();
                      }}
                      disabled={isRented}
                      title={isRented ? "This NFT is currently rented" : "Rent this NFT"}
                    >
                      {isRented ? "Rented" : "Rent Now"}
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
