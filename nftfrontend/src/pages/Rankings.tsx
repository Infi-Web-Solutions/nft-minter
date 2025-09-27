
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Trophy, Crown, Award, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiService } from '@/services/api';
import { toast } from 'sonner';
import { nftService, NFT } from '@/services/nftService';
import { apiUrl } from '@/config';

// Helper function to handle IPFS and other image URLs
const getImageUrl = (url: string) => {
  if (!url) return '';
  
  // Strip any extra query params
  const clean = url.split('?')[0];
  
  if (clean.startsWith('ipfs://')) {
    // Remove any trailing slashes
    const ipfsHash = clean.replace('ipfs://', '').replace(/\/+$/, '');
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  }

  // Handle base64 images
  if (clean.startsWith('data:')) {
    return clean;
  }

  // Handle HTTP/HTTPS URLs
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }

  // If it's just a hash, assume it's an IPFS hash
  if (clean.match(/^Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58}|B[A-Z2-7]{58}|z[1-9A-HJ-NP-Za-km-z]{48}|F[0-9A-F]{50}$/i)) {
    return `https://ipfs.io/ipfs/${clean}`;
  }

  return clean;
};

interface Collection {
  name: string;
  description: string;
  image_url: string;
  banner_url?: string;
  floor_price: number;
  total_volume: number;
  total_items: number;
  created_at: string;
  nft_image?: string; // Random NFT image URL to display
}

interface TopSeller {
  id: number;
  rank: number;
  name: string;
  avatar: string;
  volume: number;
  sales: number;
  change: number;
  address: string;
}

interface TopBuyer {
  id: number;
  rank: number;
  name: string;
  avatar: string;
  volume: number;
  purchases: number;
  change: number;
  address: string;
}

const Rankings = () => {
  const [activeTab, setActiveTab] = useState('collections');
  const [timeRange, setTimeRange] = useState('24h');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [topBuyers, setTopBuyers] = useState<TopBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [loadingBuyers, setLoadingBuyers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  // Fetch trending collections from local database
  useEffect(() => {
    const fetchTrendingCollections = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('[Rankings] Fetching trending collections...');
        let response = await apiService.getTrendingCollections();
        
        if (response.success && response.data && response.data.length > 0) {
          console.log('[Rankings] Fetched collections:', response.data);
          setCollections(response.data);
          setHasMore(response.data.length === limit);
        } else {
          // Fallback: try collections by likes
          console.warn('[Rankings] Trending empty, falling back to collections by likes');
          const byLikes = await apiService.getCollectionsByLikes();
          if (byLikes.success && byLikes.data && byLikes.data.length > 0) {
            setCollections(byLikes.data as any);
            setHasMore((byLikes.data as any).length === limit);
          } else {
            // Final fallback: all collections
            console.warn('[Rankings] Collections by likes empty, falling back to all collections');
            const all = await apiService.getCollections();
            if (all.success) {
              setCollections(all.data);
              setHasMore(all.data.length === limit);
            } else {
              console.error('[Rankings] API Error:', (all as any).error);
              setError((all as any).error || 'Failed to load collections');
          toast.error('Failed to load collections');
            }
          }
        }

        // Compute accurate stats from NFTs and override
        console.log('[Rankings] Computing collection stats from NFTs');
        const nfts: NFT[] = await nftService.getCombinedNFTs();
        const byCollection = new Map<string, NFT[]>();
        for (const n of nfts) {
          const name = typeof n.collection === 'string' ? n.collection : n.collection?.name;
          if (!name) continue;
          if (!byCollection.has(name)) byCollection.set(name, []);
          byCollection.get(name)!.push(n);
        }

        // Fetch avatars for unique creator addresses
        const uniqueCreators = Array.from(new Set(
          Array.from(byCollection.values())
            .map(arr => arr[0]?.creator_address || arr[0]?.owner_address)
            .filter(Boolean) as string[]
        ));

        const addressToAvatar = new Map<string, string>();
        await Promise.all(uniqueCreators.map(async (addr) => {
          try {
            const res = await fetch(apiUrl(`/profiles/${addr}/`));
            const data = await res.json();
            if (data?.success) {
              addressToAvatar.set(addr, data.data?.avatar_url || '');
            }
          } catch (e) {
            console.warn('[Rankings] Failed to fetch avatar for', addr);
          }
        }));

        const computedBase = Array.from(byCollection.entries()).map(([name, items]) => {
          const itemsCount = items.length;
          const sumPrice = items.reduce((acc, it) => {
            const p: any = (it as any).price ?? 0;
            const num = typeof p === 'string' ? parseFloat(p) : (typeof p === 'number' ? p : 0);
            return acc + (isFinite(num) ? num : 0);
          }, 0);
          const floorPrice = itemsCount > 0 ? sumPrice / itemsCount : 0;
          // Per user request: make volume equal to items count
          const volume = itemsCount;
          const creatorAddr = items[0]?.creator_address || items[0]?.owner_address || '';
          const avatar = (creatorAddr && addressToAvatar.get(creatorAddr)) || '';
          // Get 1 random NFT image from the collection
          const randomImage = items.length > 0 ?
            getImageUrl(items[Math.floor(Math.random() * items.length)].image_url || 
                       (items[Math.floor(Math.random() * items.length)] as any).image) :
            '';
            
          return {
            name,
            description: '',
            image_url: avatar || items[0]?.image_url || '',
            banner_url: null,
            floor_price: floorPrice,
            total_volume: volume,
            total_items: itemsCount,
            created_at: '',
            // extra fields (not in API interface)
            sales_24h: 0,
            change_24h: 0,
            volume_24h: 0,
            nft_image: randomImage, // Add random NFT image
          } as unknown as Collection & { sales_24h?: number; change_24h?: number; volume_24h?: number; nft_images: string[] };
        }).sort((a, b) => (b.total_items || 0) - (a.total_items || 0));

        // Fetch 24h and previous 24h buy activities for per-collection stats
        const fetchPaged = async (tf?: '1h' | '24h' | '7d' | '30d') => {
          let page = 1; const limitPerPage = 100; let all: any[] = [];
          while (true) {
            try {
              const res = await apiService.getActivities({ type: 'buy', page, limit: limitPerPage, ...(tf ? { time_filter: tf } : {}) });
              const data = (res as any).data || [];
              all = all.concat(data);
              const pagination = (res as any).pagination;
              if (!pagination || !pagination.has_next) break;
              page += 1;
            } catch { break; }
          }
          return all;
        };

        const activities24h = await fetchPaged('24h');
        const activities7d = await fetchPaged('7d');
        const now = Date.now();
        const prevStart = now - 48 * 60 * 60 * 1000;
        const prevEnd = now - 24 * 60 * 60 * 1000;
        const prev24h = activities7d.filter((a: any) => {
          const t = new Date(a.timestamp).getTime();
          return t >= prevStart && t < prevEnd;
        });

        const aggByCollection = (acts: any[]) => {
          const map = new Map<string, { sales: number; volume: number }>();
          for (const a of acts) {
            const col = a?.nft?.collection || '';
            if (!col) continue;
            const price = typeof a.price === 'number' ? a.price : 0;
            const cur = map.get(col) || { sales: 0, volume: 0 };
            cur.sales += 1;
            cur.volume += price || 0;
            map.set(col, cur);
          }
          return map;
        };

        const curMap = aggByCollection(activities24h);
        const prevMap = aggByCollection(prev24h);

        const computed = computedBase.map((c) => {
          const colName = c.name;
          const cur = curMap.get(colName) || { sales: 0, volume: 0 };
          const prev = prevMap.get(colName) || { sales: 0, volume: 0 };
          const change = prev.sales > 0 ? ((cur.sales - prev.sales) / prev.sales) * 100 : 0;
          return {
            ...c,
            sales_24h: cur.sales,
            change_24h: change,
            volume_24h: cur.volume,
          } as any;
        });

        if (computed.length > 0) {
          setCollections(computed as any);
          setHasMore(false);
        }
      } catch (err) {
        console.error('[Rankings] Error fetching collections:', err);
        setError('Failed to load collections');
        toast.error('Failed to load collections');
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingCollections();
  }, []);

  // Fetch top sellers and buyers data from activities (real data)
  useEffect(() => {
    const mapTimeRange = (range: string): '1h' | '24h' | '7d' | '30d' | undefined => {
      switch (range) {
        case '24h':
          return '24h';
        case '7d':
          return '7d';
        case '30d':
          return '30d';
        case 'all':
        default:
          return undefined; // no filter -> all time
      }
    };

    const fetchAllBuyActivities = async () => {
      const timeFilter = mapTimeRange(timeRange);
      let page = 1;
      const limitPerPage = 100;
      let allActivities: any[] = [];

      const fetchPage = async (p: number, tf?: '1h' | '24h' | '7d' | '30d') => {
        const res = await apiService.getActivities({
          type: 'buy',
          page: p,
          limit: limitPerPage,
          ...(tf ? { time_filter: tf } : {})
        });
        return res as any;
      };

      // Fetch with selected range first
      while (true) {
        try {
          const res = await fetchPage(page, timeFilter);

          if ((res as any).success === false) break;
          const data = (res as any).data || [];
          allActivities = allActivities.concat(data);
          const pagination = (res as any).pagination;
          if (!pagination || !pagination.has_next) break;
          page += 1;
        } catch (e) {
          console.error('[Rankings] Error fetching activities page', page, e);
          break;
        }
      }

      // Fallback to all-time if empty and not already all-time
      if (allActivities.length === 0 && timeRange !== 'all') {
        console.warn('[Rankings] No activities in range, refetching all-time');
        page = 1;
        while (true) {
          try {
            const res = await fetchPage(page, undefined);
            if ((res as any).success === false) break;
            const data = (res as any).data || [];
            allActivities = allActivities.concat(data);
            const pagination = (res as any).pagination;
            if (!pagination || !pagination.has_next) break;
            page += 1;
          } catch (e) {
            console.error('[Rankings] Error fetching all-time activities page', page, e);
            break;
          }
        }
      }

      return allActivities;
    };

    const aggregateSellersAndBuyers = (activities: any[]) => {
      type SellerAgg = { address: string; name: string; avatar: string; volume: number; sales: number };
      type BuyerAgg = { address: string; name: string; avatar: string; volume: number; purchases: number };
      const sellersMap = new Map<string, SellerAgg>();
      const buyersMap = new Map<string, BuyerAgg>();

      for (const act of activities) {
        const price = typeof act.price === 'number' ? act.price : 0;
        const fromAddr: string = act.from?.address || 'unknown';
        const toAddr: string = act.to?.address || 'unknown';

        if (fromAddr && fromAddr !== 'unknown') {
          const prev = sellersMap.get(fromAddr) || {
            address: fromAddr,
            name: act.from?.name || fromAddr,
            avatar: act.from?.avatar || '',
            volume: 0,
            sales: 0,
          };
          prev.volume += price || 0;
          prev.sales += 1;
          sellersMap.set(fromAddr, prev);
        }

        if (toAddr && toAddr !== 'unknown') {
          const prev = buyersMap.get(toAddr) || {
            address: toAddr,
            name: act.to?.name || toAddr,
            avatar: act.to?.avatar || '',
            volume: 0,
            purchases: 0,
          };
          prev.volume += price || 0;
          prev.purchases += 1;
          buyersMap.set(toAddr, prev);
        }
      }

      const sellerList: TopSeller[] = Array.from(sellersMap.values())
        .sort((a, b) => b.sales - a.sales || b.volume - a.volume)
        .map((s, idx) => ({
          id: idx + 1,
          rank: idx + 1,
          name: s.name,
          avatar: s.avatar || '',
          volume: s.volume,
          sales: s.sales,
          change: 0,
          address: s.address,
        }));

      const buyerList: TopBuyer[] = Array.from(buyersMap.values())
        .sort((a, b) => b.purchases - a.purchases || b.volume - a.volume)
        .map((b, idx) => ({
          id: idx + 1,
          rank: idx + 1,
          name: b.name,
          avatar: b.avatar || '',
          volume: b.volume,
          purchases: b.purchases,
          change: 0,
          address: b.address,
        }));

      return { sellerList, buyerList };
    };

    const run = async () => {
      try {
        setLoadingSellers(true);
        setLoadingBuyers(true);
        const activities = await fetchAllBuyActivities();
        const { sellerList, buyerList } = aggregateSellersAndBuyers(activities);
        setTopSellers(sellerList);
        setTopBuyers(buyerList);
      } catch (err) {
        console.error('[Rankings] Error computing rankings:', err);
        toast.error('Failed to load rankings');
      } finally {
        setLoadingSellers(false);
        setLoadingBuyers(false);
      }
    };

    run();
  }, [timeRange]);

  const loadMoreCollections = async () => {
    try {
      setLoading(true);
      const response = await apiService.getTrendingCollections();
      
      if (response.success) {
        const newCollections = response.data;
        setCollections(prev => [...prev, ...newCollections]);
        setHasMore(newCollections.length === limit);
        setOffset(prev => prev + limit);
      } else {
        toast.error('Failed to load more collections');
      }
    } catch (err) {
      console.error('[Rankings] Error loading more collections:', err);
      toast.error('Failed to load more collections');
    } finally {
      setLoading(false);
    }
  };

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

  const formatChange = (change: number) => {
    return change.toFixed(1);
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Award className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
    return <span className="font-bold text-muted-foreground">#{rank}</span>;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">Top Rankings</h1>
          <p className="text-muted-foreground">Discover the top-performing collections and creators</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="collections">Collections</TabsTrigger>
              <TabsTrigger value="sellers">Top Sellers</TabsTrigger>
              <TabsTrigger value="buyers">Top Buyers</TabsTrigger>
            </TabsList>
            
            <div className="flex gap-4">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Loading rankings...</p>
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
              <TabsContent value="collections">
                {collections.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">No collections found.</div>
                ) : (
                <div className="space-y-4">
                  {collections.map((collection, index) => (
                <Card key={collection.name} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-12">
                        {getRankIcon(index + 1)}
                      </div>
                      
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
                        <img 
                          src={getImageUrl((collection as any).nft_image || collection.image_url)} 
                          alt={collection.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            const currentSrc = target.src;
                            
                            // If we're using ipfs.io and it failed, try alternate IPFS gateways
                            if (currentSrc.includes('ipfs.io')) {
                              if (currentSrc.includes('/ipfs/')) {
                                const hash = currentSrc.split('/ipfs/')[1];
                                // Try cloudflare-ipfs.com
                                target.src = `https://cloudflare-ipfs.com/ipfs/${hash}`;
                                return;
                              }
                            }
                            // If all else fails, show placeholder
                            target.src = '/placeholder.svg';
                          }}
                        />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{collection.name}</h3>
                          <Badge variant="secondary" className="text-xs">✓</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{collection.total_items.toLocaleString()} items</p>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-8 text-sm">
                        <div>
                          <p className="text-muted-foreground mb-1">Floor Price</p>
                          <p className="font-medium">Ξ {formatPrice((collection as any).floor_price || 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">24h Volume</p>
                          <p className="font-medium">Ξ {formatVolume(((collection as any).volume_24h ?? (collection as any).total_volume) || 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">24h Change</p>
                          <p className={`font-medium flex items-center gap-1 ${((collection as any).change_24h || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {((collection as any).change_24h || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {formatChange(Math.abs((collection as any).change_24h || 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">24h Sales</p>
                          <p className="font-medium">{(collection as any).sales_24h || 0}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
                )}
          </TabsContent>

              <TabsContent value="sellers">
                {loadingSellers ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Loading top sellers...</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {topSellers.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">No seller activity found.</div>
                    ) : topSellers.map((seller) => (
                <Card key={seller.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-12">
                        {getRankIcon(seller.rank)}
                      </div>
                      
                                             <Avatar className="h-12 w-12">
                        {seller.avatar && <AvatarImage src={seller.avatar} alt={seller.name} />}
                        <AvatarFallback>{seller.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <h3 className="font-semibold">{seller.name}</h3>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-8 text-sm">
                        <div>
                          <p className="text-muted-foreground mb-1">Volume</p>
                          <p className="font-medium">Ξ {formatVolume(seller.volume)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Sales</p>
                          <p className="font-medium">{seller.sales}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Change</p>
                          <p className={`font-medium flex items-center gap-1 ${
                            seller.change >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {seller.change >= 0 ? 
                              <TrendingUp className="h-3 w-3" /> : 
                              <TrendingDown className="h-3 w-3" />
                            }
                            {formatChange(Math.abs(seller.change))}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
                )}
              </TabsContent>

              <TabsContent value="buyers">
                {loadingBuyers ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Loading top buyers...</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {topBuyers.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">No buyer activity found.</div>
                    ) : topBuyers.map((buyer) => (
                <Card key={buyer.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-12">
                        {getRankIcon(buyer.rank)}
                      </div>
                      
                                             <Avatar className="h-12 w-12">
                        {buyer.avatar && <AvatarImage src={buyer.avatar} alt={buyer.name} />}
                        <AvatarFallback>{buyer.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <h3 className="font-semibold">{buyer.name}</h3>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-8 text-sm">
                        <div>
                          <p className="text-muted-foreground mb-1">Volume</p>
                          <p className="font-medium">Ξ {formatVolume(buyer.volume)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Purchases</p>
                          <p className="font-medium">{buyer.purchases}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Change</p>
                          <p className={`font-medium flex items-center gap-1 ${
                            buyer.change >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {buyer.change >= 0 ? 
                              <TrendingUp className="h-3 w-3" /> : 
                              <TrendingDown className="h-3 w-3" />
                            }
                            {formatChange(Math.abs(buyer.change))}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>

        {!loading && !error && activeTab === 'collections' && hasMore && (
          <div className="flex justify-center mt-12">
            <Button 
              variant="outline" 
              size="lg" 
              onClick={loadMoreCollections}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}

        {!loading && !error && activeTab === 'collections' && !hasMore && collections.length > 0 && (
          <div className="text-center mt-12">
            <p className="text-muted-foreground">No more collections to load</p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Rankings;
