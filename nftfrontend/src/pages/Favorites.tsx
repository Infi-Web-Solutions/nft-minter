import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Grid, List } from 'lucide-react';
import NFTCard from '@/components/NFTCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { nftService, NFT } from '@/services/nftService';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';

const Favorites = () => {
  const { address } = useWallet();
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteNfts, setFavoriteNfts] = useState<NFT[]>([]);

  // Fetch user's favorite NFTs
  useEffect(() => {
    const fetchFavoriteNFTs = async () => {
      if (!address) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const nfts = await nftService.getUserLikedNFTs(address);
        console.log('[Favorites] Fetched favorite NFTs:', nfts.length);
        setFavoriteNfts(nfts);
      } catch (error) {
        console.error('[Favorites] Error fetching favorite NFTs:', error);
        toast.error('Failed to load favorite NFTs');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFavoriteNFTs();
  }, [address]);

  const handleLikeToggle = async (nftId: string | number, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    console.log('[Favorites] handleLikeToggle called with:', { nftId, nftId_type: typeof nftId, newLikedState });
    
    try {
      const result = await nftService.toggleNFTLike(nftId, address);
      if (result.success) {
        // Use the actual liked state from the backend
        const actualLikedState = result.liked !== undefined ? result.liked : newLikedState;
        
        if (!actualLikedState) {
          // If the NFT was unliked, remove it from the favorites list
          setFavoriteNfts(prevNfts => prevNfts.filter(nft => nft.id !== nftId));
          toast.success('Removed from favorites');
        } else {
          // If the NFT was liked, update its status
          setFavoriteNfts(prevNfts => 
            prevNfts.map(nft => 
              nft.id === nftId 
                ? { ...nft, liked: actualLikedState }
                : nft
            )
          );
          toast.success('Added to favorites');
        }
      } else {
        toast.error(result.error || 'Failed to update like status');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update like status');
    } finally {
      await refreshLikedNFTs();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading your favorites...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-6">Please connect your wallet to view your favorite NFTs</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">My Favorites</h1>
            <p className="text-muted-foreground">
              {favoriteNfts.length === 0 
                ? "You haven't liked any NFTs yet" 
                : `You have ${favoriteNfts.length} favorite NFT${favoriteNfts.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {favoriteNfts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">❤️</div>
            <h2 className="text-2xl font-bold mb-4">No favorites yet</h2>
            <p className="text-muted-foreground mb-6">
              Start exploring NFTs and like the ones you love to see them here
            </p>
            <Button onClick={() => window.location.href = '/marketplace'}>
              Explore NFTs
            </Button>
          </div>
        ) : (
          <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
            {favoriteNfts.map((nft) => {
              // Determine the correct image URL
              const imageUrl = nft.image_url || nft.image || '';
              
              // Determine the correct price
              let price = 0;
              if (nft.price) {
                price = typeof nft.price === 'string' ? parseFloat(nft.price) : nft.price;
              }
              
              const priceString = price > 0 ? price.toFixed(4) : '0';
              
              return (
                <NFTCard
                  key={nft.id}
                  title={nft.title || nft.name}
                  collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                  price={priceString}
                  image={imageUrl}
                  tokenId={nft.token_id}
                  id={nft.id}
                  liked={likedNFTIds.has(String(nft.id))}
                  isAuction={nft.isAuction || nft.is_auction}
                  timeLeft={nft.timeLeft}
                  views={nft.views}
                  onLike={(newLikedState) => {
                    handleLikeToggle(nft.id, newLikedState);
                  }}
                  owner_address={nft.owner_address}
                  is_listed={nft.is_listed}
                  onClick={() => {
                    // Fix redirect issue: remove 'local_' prefix if present
                    const cleanNftId = typeof nft.id === 'string' && nft.id.startsWith('local_') ? nft.id.slice(6) : nft.id;
                    window.location.href = `/nft/${cleanNftId}`;
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Favorites; 