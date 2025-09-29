
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, TrendingUp, TrendingDown, Grid, List, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiService } from '@/services/api';
import { toast } from 'sonner';
import NFTCard from '@/components/NFTCard';
import { useLikes } from '@/contexts/LikeContext';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';
import { apiUrl } from '@/config';

interface Collection {
  name: string;
  description: string;
  image_url: string;
  banner_url?: string;
  floor_price: number;
  total_volume: number;
  total_items: number;
  created_at: string;
}

const Collections = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('likes');
  const [topLikedNfts, setTopLikedNfts] = useState<any[]>([]);
  const { isLiked, toggleLike } = useLikes();
  // Toggle to show/hide the collections grid/list section
  const showCollectionsGrid = false;

  // Fetch trending collections from local database
  useEffect(() => {
    const fetchTrendingCollections = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('[Collections] Fetching collections ranked by likes...');
        const response = await apiService.getCollectionsByLikes();
        if (response.success) {
          console.log('[Collections] Fetched collections (by likes):', response.data);
          setCollections(response.data as any);
        } else {
          console.error('[Collections] API Error:', response.error);
          setError(response.error || 'Failed to load collections');
          toast.error('Failed to load collections');
        }
        // Fetch top liked NFTs from local combined endpoint
        console.log('[Collections] Fetching top liked NFTs...');
        const nftsRes = await fetch(apiUrl('/nfts/combined/?sort=likes'));
        const nftsData = await nftsRes.json();
        if (nftsData.success) {
          setTopLikedNfts(nftsData.data || []);
        }
      } catch (err) {
        console.error('[Collections] Error fetching collections:', err);
        setError('Failed to load collections');
        toast.error('Failed to load collections');
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingCollections();
  }, []);

  // Filter and sort collections
  const filteredAndSortedCollections = collections
    .filter(collection => 
      collection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (collection.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case 'likes':
          return (b.total_likes || 0) - (a.total_likes || 0);
        case 'volume':
          return (b.total_volume || 0) - (a.total_volume || 0);
        case 'floor':
          return (b.floor_price || 0) - (a.floor_price || 0);
        case 'items':
          return (b.total_items || 0) - (a.total_items || 0);
        default:
          return 0;
      }
    });

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toFixed(0);
  };

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  // Helper to normalize image URLs (IPFS support)
  const getImageUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    return url;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">Top Collections</h1>
          <p className="text-muted-foreground">Discover the most popular NFT collections</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Search collections..." 
              className="pl-10" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="likes">Most Likes</SelectItem>
              <SelectItem value="volume">Total Volume</SelectItem>
              <SelectItem value="floor">Floor Price</SelectItem>
              <SelectItem value="owners">Owners</SelectItem>
              <SelectItem value="items">Total Items</SelectItem>
            </SelectContent>
          </Select>
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

        {loading && (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading trending collections...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        )}

        {!loading && !error && (
          <>
            {showCollectionsGrid && (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredAndSortedCollections.map((collection, index) => (
                      <Card key={collection.name} className="hover:shadow-lg transition-shadow cursor-pointer">
                        <div className="aspect-square overflow-hidden rounded-t-lg">
                          <img 
                            src={getImageUrl(collection.image_url)} 
                            alt={collection.name}
                            className="h-full w-full object-cover hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder.svg';
                            }}
                          />
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold truncate">{collection.name}</h3>
                            <Badge variant="secondary" className="text-xs">#{index + 1}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{collection.description}</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Floor</p>
                              <p className="font-medium">Ξ {formatPrice(collection.floor_price)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Volume</p>
                              <p className="font-medium">Ξ {formatVolume(collection.total_volume)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Items</p>
                              <p className="font-medium">{collection.total_items.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Owners</p>
                              <p className="font-medium">{(collection as any).owners_count ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Likes</p>
                              <p className="font-medium">{(collection as any).total_likes ?? 0}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredAndSortedCollections.map((collection, index) => (
                      <Card key={collection.name} className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-4">
                            <div className="text-lg font-bold text-muted-foreground w-8">
                              #{index + 1}
                            </div>
                            <div className="w-16 h-16 rounded-lg overflow-hidden">
                              <img 
                                src={getImageUrl(collection.image_url)} 
                                alt={collection.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                                }}
                              />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold">{collection.name}</h3>
                                <Badge variant="secondary" className="text-xs">Trending</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1">{collection.description}</p>
                            </div>
                            <div className="grid grid-cols-4 gap-8 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">Floor Price</p>
                                <p className="font-medium">Ξ {formatPrice((collection as any).floor_price || 0)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Volume</p>
                                <p className="font-medium">Ξ {formatVolume((collection as any).total_volume || 0)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Owners</p>
                                <p className="font-medium">{(collection as any).owners_count ?? 0}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Likes</p>
                                <p className="font-medium">{(collection as any).total_likes ?? 0}</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Top Liked NFTs section */}
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-4">Top Liked NFTs</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {topLikedNfts.map((nft: any) => (
                  <NFTCard
                    key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
                    title={nft.title || nft.name}
                    collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                    price={(nft.price ?? 0).toString()}
                    image={nft.image_url || nft.image}
                    tokenId={nft.token_id}
                    id={nft.id}
                    liked={isLiked(nft.id)}
                    isAuction={nft.isAuction || nft.is_auction}
                    timeLeft={nft.timeLeft}
                    views={nft.views}
                    onLike={async () => { await toggleLike(nft.id); }}
                    owner_address={nft.owner_address}
                    is_listed={nft.is_listed}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {showCollectionsGrid && !loading && !error && filteredAndSortedCollections.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No collections found</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>
        )}

        {showCollectionsGrid && !loading && !error && filteredAndSortedCollections.length > 0 && (
          <div className="flex justify-center mt-12">
            <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
              Refresh Collections
            </Button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Collections;
