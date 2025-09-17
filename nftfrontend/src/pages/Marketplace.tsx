
import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Grid, List, Filter } from 'lucide-react';
import NFTCard from '@/components/NFTCard';
import FilterSidebar from '@/components/FilterSidebar';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { nftService, NFT } from '@/services/nftService';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';

const Marketplace = () => {
  const { address } = useWallet();
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [isLoading, setIsLoading] = useState(true);
  const [allNfts, setAllNfts] = useState<NFT[]>([]);
  
  const [filters, setFilters] = useState({
    status: [] as string[],
    priceRange: [0, 100] as [number, number],
    collections: [] as string[],
    blockchain: [] as string[]
  });

  // Fetch NFTs from API
  useEffect(() => {
    const fetchNFTs = async () => {
      setIsLoading(true);
      try {
        const nfts = await nftService.getCombinedNFTs(address);
        console.log('[Marketplace] Fetched NFTs:', nfts.length);
        console.log('[Marketplace] First NFT sample:', nfts[0]);
        console.log('[Marketplace] All NFTs:', nfts);
        setAllNfts(nfts);
      } catch (error) {
        console.error('[Marketplace] Error fetching NFTs:', error);
        toast.error('Failed to load NFTs');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNFTs();
  }, [address]);

  // Debug: Log whenever allNfts changes
  useEffect(() => {
    console.log('[Marketplace] allNfts state changed:', allNfts.length);
  }, [allNfts]);

  // Filter and sort NFTs based on current filters
  const filteredNfts = useMemo(() => {
    console.log('[Marketplace] Starting filter with', allNfts.length, 'NFTs');

    const getNumericPrice = (nft: NFT): number => {
      // prefer explicit price, then current_price, then first sell order (wei -> ETH)
      if (nft.price !== undefined && nft.price !== null) {
        return typeof nft.price === 'string' ? parseFloat(nft.price) : nft.price;
      }
      if (nft.current_price !== undefined && nft.current_price !== null) {
        return typeof nft.current_price === 'string' ? parseFloat(nft.current_price) : nft.current_price;
      }
      if (nft.sell_orders && nft.sell_orders.length > 0) {
        const first = nft.sell_orders[0];
        if (first.current_price !== undefined && first.current_price !== null) {
          const raw = parseFloat(String(first.current_price));
          if (!isNaN(raw)) return raw / (10 ** 18);
        }
      }
      return 0;
    };

    const hasStatus = (nft: NFT, statusLabel: string): boolean => {
      switch (statusLabel) {
        case 'Buy Now':
          return Boolean(nft.is_listed);
        case 'On Auction':
          return Boolean(nft.is_auction || nft.isAuction);
        case 'New': {
          const created = nft.createdAt ? new Date(nft.createdAt).getTime() : 0;
          if (!created) return false;
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          return Date.now() - created <= sevenDaysMs;
        }
        case 'Has Offers':
          return Array.isArray(nft.sell_orders) && nft.sell_orders.length > 0;
        default:
          // fallback to direct status match if provided
          return (nft.status || '') === statusLabel;
      }
    };

    let filtered = allNfts.filter((nft) => {
      // Tab filter by category
      if (activeTab !== 'all' && nft.category !== activeTab) return false;

      // Status filter (any of the selected statuses should match)
      if (filters.status.length > 0) {
        const anyMatch = filters.status.some((label) => hasStatus(nft, label));
        if (!anyMatch) return false;
      }

      // Price range filter (inclusive)
      const price = getNumericPrice(nft);
      if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;

      // Collections filter
      if (filters.collections.length > 0) {
        const collectionName = typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || '';
        if (!filters.collections.includes(collectionName)) return false;
      }

      // Blockchain filter
      if (filters.blockchain.length > 0) {
        const chain = nft.blockchain || '';
        if (!filters.blockchain.includes(chain)) return false;
      }

      return true;
    });

    // Sorting
    switch (sortBy) {
      case 'price-low':
        filtered.sort((a, b) => getNumericPrice(a) - getNumericPrice(b));
        break;
      case 'price-high':
        filtered.sort((a, b) => getNumericPrice(b) - getNumericPrice(a));
        break;
      case 'ending':
        filtered = filtered
          .filter(nft => nft.isAuction || nft.is_auction)
          .sort(() => Math.random() - 0.5);
        break;
      case 'most-liked':
        filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case 'recent':
      default:
        filtered.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
    }

    console.log('[Marketplace] Final filtered result:', filtered.length);
    return filtered;
  }, [activeTab, filters, sortBy, allNfts]);

  // Debug: Log filtered results
  useEffect(() => {
    console.log('[Marketplace] filteredNfts result:', filteredNfts.length);
    if (filteredNfts.length > 0) {
      console.log('[Marketplace] First filtered NFT:', filteredNfts[0]);
      console.log('[Marketplace] First NFT price:', filteredNfts[0].price);
      console.log('[Marketplace] First NFT price type:', typeof filteredNfts[0].price);
      console.log('[Marketplace] First NFT image:', filteredNfts[0].image);
      console.log('[Marketplace] First NFT image_url:', filteredNfts[0].image_url);
      console.log('[Marketplace] First NFT collection:', filteredNfts[0].collection);
    }
  }, [filteredNfts]);

  const handleFilterChange = (filterType: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleClearAllFilters = () => {
    setFilters({
      status: [] as string[],
      priceRange: [0, 100] as [number, number],
      collections: [] as string[],
      blockchain: [] as string[]
    });
  };

  const handleLikeToggle = async (nftId: string | number, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    console.log('[Marketplace] handleLikeToggle called with:', { 
      nftId, 
      nftId_type: typeof nftId, 
      newLikedState,
      currentLikedState: likedNFTIds.has(String(nftId))
    });
    
    try {
      const result = await nftService.toggleNFTLike(nftId, address);
      console.log('[Marketplace] toggleNFTLike result:', result);
      if (result.success) {
        // Use the actual liked state from the backend
        const actualLikedState = result.liked !== undefined ? result.liked : newLikedState;
        console.log('[Marketplace] Setting actual liked state:', actualLikedState);
        // Update the local state immediately for better UX
        setAllNfts(prevNfts => 
          prevNfts.map(nft => 
            nft.id === nftId 
              ? { ...nft, liked: actualLikedState }
              : nft
          )
        );
        toast.success(actualLikedState ? 'Added to favorites' : 'Removed from favorites');
        await refreshLikedNFTs();
      } else {
        toast.error(result.error || 'Failed to update like status');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update like status');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading NFTs...</p>
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
            <h1 className="text-3xl font-bold mb-2">Explore NFTs</h1>
            <p className="text-muted-foreground">Discover the world's top crypto art and collectibles</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </Button>
            
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
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="art">Art</TabsTrigger>
            <TabsTrigger value="gaming">Gaming</TabsTrigger>
            <TabsTrigger value="music">Music</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            Showing {filteredNfts.length} of {allNfts.length} NFTs
          </p>
          
          <div className="flex items-center space-x-4">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently Listed</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="ending">Ending Soon</SelectItem>
                <SelectItem value="most-liked">Most Liked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-6">
          {showFilters && (
            <FilterSidebar 
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearAll={handleClearAllFilters}
            />
          )}
          
          <div className="flex-1">
            <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
              {filteredNfts.map((nft) => {
                                 // Debug each NFT being rendered
                 console.log('[Marketplace] Rendering NFT:', {
                   id: nft.id,
                   id_type: typeof nft.id,
                   title: nft.title || nft.name,
                   image: nft.image,
                   image_url: nft.image_url,
                   price: nft.price,
                   current_price: nft.current_price,
                   sell_orders: nft.sell_orders,
                   collection: nft.collection,
                   source: nft.source,
                   token_id: nft.token_id
                 });
                
                // Determine the correct image URL
                const imageUrl = nft.image_url || nft.image || '';
                
                // Determine the correct price - check multiple sources
                let price = 0;
                if (nft.price) {
                  price = typeof nft.price === 'string' ? parseFloat(nft.price) : nft.price;
                } else if (nft.current_price) {
                  price = typeof nft.current_price === 'string' ? parseFloat(nft.current_price) : nft.current_price;
                } else if (nft.sell_orders && nft.sell_orders.length > 0) {
                  // Extract price from sell orders
                  const sellOrder = nft.sell_orders[0];
                  if (sellOrder.current_price) {
                    price = parseFloat(String(sellOrder.current_price)) / (10 ** 18); // Convert from wei
                  }
                }
                
                const priceString = price > 0 ? price.toFixed(4) : '0';
                
                console.log('[Marketplace] Final price calculation:', {
                  original_price: nft.price,
                  current_price: nft.current_price,
                  calculated_price: price,
                  price_string: priceString
                });
                
                return (
                  <NFTCard
                    key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
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
                       // Pass the full NFT ID and new liked state to the like handler
                       handleLikeToggle(nft.id, newLikedState);
                     }}
                    owner_address={nft.owner_address}
                    is_listed={nft.is_listed}
                  />
                );
              })}
            </div>
            
            {filteredNfts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground mb-4">No NFTs match your current filters</p>
                <Button variant="outline" onClick={handleClearAllFilters}>
                  Clear All Filters
                </Button>
              </div>
            ) : (
              <div className="flex justify-center mt-12">
                <Button variant="outline" size="lg">
                  Load More NFTs
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Marketplace;
