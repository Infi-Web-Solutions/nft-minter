import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NFTCard from '@/components/NFTCard';
import FilterSidebar from '@/components/FilterSidebar';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Grid, List, Filter } from 'lucide-react';
import { nftService, NFT } from '@/services/nftService';
import { toast } from 'sonner';

const MarketplaceAPI = () => {
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
        const nfts = await nftService.getCombinedNFTs();
        console.log('[MarketplaceAPI] Fetched NFTs:', nfts.length);
        setAllNfts(nfts);
      } catch (error) {
        console.error('[MarketplaceAPI] Error fetching NFTs:', error);
        toast.error('Failed to load NFTs');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNFTs();
  }, []);

  // Filter and sort NFTs based on current filters
  const filteredNfts = useMemo(() => {
    let filtered = allNfts.filter(nft => {
      // Tab filter
      if (activeTab !== 'all' && nft.category !== activeTab) return false;
      
      // Status filter
      if (filters.status.length > 0 && !filters.status.includes(nft.status || '')) return false;
      
      // Price range filter
      const price = typeof nft.price === 'string' ? parseFloat(nft.price) : nft.price;
      if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;
      
      // Collections filter
      const collectionName = typeof nft.collection === 'string' ? nft.collection : nft.collection?.name;
      if (filters.collections.length > 0 && !filters.collections.includes(collectionName || '')) return false;
      
      // Blockchain filter
      if (filters.blockchain.length > 0 && !filters.blockchain.includes(nft.blockchain || '')) return false;
      
      return true;
    });

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        filtered.sort((a, b) => {
          const priceA = typeof a.price === 'string' ? parseFloat(a.price) : a.price;
          const priceB = typeof b.price === 'string' ? parseFloat(b.price) : b.price;
          return priceA - priceB;
        });
        break;
      case 'price-high':
        filtered.sort((a, b) => {
          const priceA = typeof a.price === 'string' ? parseFloat(a.price) : a.price;
          const priceB = typeof b.price === 'string' ? parseFloat(b.price) : b.price;
          return priceB - priceA;
        });
        break;
      case 'ending':
        filtered = filtered.filter(nft => nft.isAuction || nft.is_auction).sort((a, b) => {
          // Sort by time left (ascending) - simplified for demo
          return Math.random() - 0.5;
        });
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

    return filtered;
  }, [activeTab, filters, sortBy, allNfts]);

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

  const handleLikeToggle = async (nftId: number, newLikedState: boolean) => {
    // This would need to be implemented with the actual user address
    console.log('Toggled like for NFT:', nftId, 'new state:', newLikedState);
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
            <h1 className="text-3xl font-bold mb-2">NFT Marketplace</h1>
            <p className="text-muted-foreground">Discover and collect unique digital assets</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <div className="flex items-center gap-2">
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

        <div className="flex gap-8">
          {showFilters && (
            <FilterSidebar
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearAll={handleClearAllFilters}
            />
          )}

          <div className="flex-1">
            <div className="flex justify-between items-center mb-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="all">All Items</TabsTrigger>
                  <TabsTrigger value="art">Art</TabsTrigger>
                  <TabsTrigger value="gaming">Gaming</TabsTrigger>
                  <TabsTrigger value="music">Music</TabsTrigger>
                  <TabsTrigger value="all">More</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {filteredNfts.length} items
                </span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently Listed</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="ending">Ending Soon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
              {filteredNfts.map((nft) => (
                <NFTCard
                  key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
                  title={nft.title || nft.name}
                  collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                  price={typeof nft.price === 'string' ? nft.price : (nft.price ? nft.price.toString() : '0')}
                  image={nft.image || nft.image_url}
                  tokenId={nft.token_id}
                  id={nft.id}
                  liked={nft.liked}
                  isAuction={nft.isAuction || nft.is_auction}
                  timeLeft={nft.timeLeft}
                  views={nft.views}
                  onLike={(newLikedState) => handleLikeToggle(Number(nft.id), newLikedState)}
                  owner_address={nft.owner_address}
                  is_listed={nft.is_listed}
                />
              ))}
            </div>

            {filteredNfts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No NFTs found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MarketplaceAPI; 