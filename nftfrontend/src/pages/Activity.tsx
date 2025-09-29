
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ExternalLink, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { activityService, ActivityFilters } from '@/services/activityService';
import type { Activity } from '@/services/api';
import { nftService, NFT } from '@/services/nftService';
import { toast } from 'sonner';

// Helper function to get user display info
const getUserDisplayInfo = (user: { address: string; name: string; avatar: string }) => {
  return {
    name: user.name || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`,
    avatar: user.avatar || '',
    initials: (user.name || user.address.slice(0, 2)).slice(0, 2).toUpperCase(),
    address: user.address
  };
};

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

const Activity = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [timeFilter, setTimeFilter] = useState<'1h' | '24h' | '7d' | '30d' | 'all'>('24h');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalItems, setTotalItems] = useState(0);

  // Fetch activities
  const fetchActivities = async (page: number = 1, reset: boolean = false) => {
    try {
      setIsLoading(true);
      
      const baseFilters: ActivityFilters = {
        page,
        limit: 20,
        time_filter: timeFilter === 'all' ? undefined : (timeFilter as '1h' | '24h' | '7d' | '30d'),
        search: searchQuery || undefined,
      };

      // Determine which types to request
      const types: Array<'mint' | 'list' | 'buy' | 'bid' | 'transfer' | 'delist'> | undefined =
        activeTab === 'all' ? undefined : (
          activeTab === 'transfer' ? ['transfer', 'buy'] : [activeTab as any]
        );

      let aggregatedData: Activity[] = [];
      let aggregatedHasNext = false;
      let aggregatedTotal = 0;

      if (!types) {
        // All activities (single request)
        let response = await activityService.getActivities({ ...baseFilters });
        if (response.success) {
          // Fallback: if no results for selected range, try all-time
          if ((response.data || []).length === 0 && timeFilter !== 'all') {
            const fallback = await activityService.getActivities({ ...baseFilters, time_filter: undefined, page: 1 });
            if (fallback.success) {
              response = fallback;
            }
          }
          aggregatedData = response.data;
          aggregatedHasNext = response.pagination.has_next;
          aggregatedTotal = response.pagination.total_items;
        } else {
          toast.error('Failed to load activities');
        }
      } else if (types.length === 1) {
        // Single type
        const response = await activityService.getActivities({ ...baseFilters, type: types[0] });
        if (response.success) {
          aggregatedData = response.data;
          aggregatedHasNext = response.pagination.has_next;
          aggregatedTotal = response.pagination.total_items;
        } else {
          toast.error('Failed to load activities');
        }
      } else {
        // Multiple types (e.g., transfer includes buy + transfer). Fetch in parallel and merge
        const results = await Promise.all(types.map(t => activityService.getActivities({ ...baseFilters, type: t })));
        const successful = results.filter(r => r.success);
        const merged = successful.flatMap(r => r.data);
        // Sort by timestamp desc
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        aggregatedData = merged.slice(0, baseFilters.limit || 20);
        aggregatedHasNext = successful.some(r => r.pagination.has_next) || merged.length > (baseFilters.limit || 20);
        aggregatedTotal = successful.reduce((sum, r) => sum + (r.pagination.total_items || 0), 0);
      }
      
      let finalData = aggregatedData;

      // Fallback synthesis from NFTs for Mints/Listings/All when nothing returned
      if ((finalData.length === 0 || (reset && aggregatedTotal === 0)) && (activeTab === 'mint' || activeTab === 'list' || activeTab === 'all')) {
        const synthesizeFromNFTs = async (): Promise<Activity[]> => {
          const nfts: NFT[] = await nftService.getCombinedNFTs();

          const withinWindow = (dateStr?: string) => {
            if (!dateStr) return true;
            if (timeFilter === 'all') return true;
            const created = new Date(dateStr).getTime();
            const now = Date.now();
            const ranges: Record<string, number> = { '1h': 3600000, '24h': 86400000, '7d': 7*86400000, '30d': 30*86400000 };
            const ms = ranges[timeFilter as '1h' | '24h' | '7d' | '30d'];
            return now - created <= ms;
          };

          const toActivity = (nft: NFT, type: 'mint' | 'list'): Activity | null => {
            if (!nft || !nft.id) return null;
            
            return {
              id: Number(nft.token_id) || Number(nft.id) || Math.floor(Math.random()*1e9),
            type,
            nft: {
              id: Number(nft.id) || 0,
              name: nft.name || nft.title || 'NFT',
              image_url: nft.image_url || (nft as any).image || '',
              collection: typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || '',
              token_id: Number(nft.token_id) || 0,
            },
            from: {
              address: type === 'mint' ? (nft.creator_address || '') : (nft.owner_address || ''),
              name: type === 'mint' ? (nft.creator_address || '') : (nft.owner_address || ''),
              avatar: '',
            },
            to: {
              address: type === 'mint' ? (nft.owner_address || '') : '',
              name: type === 'mint' ? (nft.owner_address || '') : '',
              avatar: '',
            },
            price: typeof nft.price === 'string' ? parseFloat(nft.price) : (nft.price as number) || null,
            timestamp: nft.createdAt || (nft as any).created_at || new Date().toISOString(),
            time_ago: '',
            transaction_hash: `local-${type}-${nft.id}`,
            block_number: 0,
            gas_used: 0,
            gas_price: null,
            };
          };

          const minted: Activity[] = (activeTab === 'mint' || activeTab === 'all')
            ? nfts.filter(n => withinWindow((n as any).created_at || (n as any).createdAt)).map(n => toActivity(n, 'mint'))
            : [];
          const listed: Activity[] = (activeTab === 'list' || activeTab === 'all')
            ? nfts.filter(n => n.is_listed).filter(n => withinWindow((n as any).created_at || (n as any).createdAt)).map(n => toActivity(n, 'list'))
            : [];

          const combined = [...minted, ...listed].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return combined.slice(0, baseFilters.limit || 20);
        };

        try {
          finalData = await synthesizeFromNFTs();
          aggregatedHasNext = false;
          aggregatedTotal = finalData.length;
        } catch (e) {
          console.warn('[Activity] Synthesis from NFTs failed:', e);
        }
      }

      if (reset) {
        setActivities(finalData);
      } else {
        setActivities(prev => [...prev, ...finalData]);
      }
      setHasMore(aggregatedHasNext);
      setTotalItems(aggregatedTotal);
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast.error('Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchActivities(1, true);
  }, [activeTab, timeFilter, searchQuery]);

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  // Handle time filter change
  const handleTimeFilterChange = (value: string) => {
    setTimeFilter(value as '1h' | '24h' | '7d' | '30d' | 'all');
    setCurrentPage(1);
  };

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  // Load more activities
  const loadMore = () => {
    if (!isLoading && hasMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchActivities(nextPage, false);
    }
  };

  // Get activity badge
  const getActivityBadge = (type: string) => {
    return activityService.getActivityBadge(type);
  };

  // Render activity card
  const renderActivityCard = (activity: Activity | null) => {
    if (!activity) return null;
    if (!activity.nft) return null;

    const badge = getActivityBadge(activity.type);
    
                return (
                  <Card key={activity.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <Badge variant={badge.variant} className="min-w-fit">
                          {badge.label}
                        </Badge>
                        
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted relative">
                          {activity.nft ? (
                            <img 
                              src={getImageUrl(activity.nft.image_url)} 
                              alt={activity.nft.name}
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

                              // If all else fails, show collection placeholder
                              target.src = '/placeholder.svg';
                            }}
                          />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-muted">
                              <span className="text-xs text-muted-foreground">No Image</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1">
                          {activity.nft ? (
                            <>
                              <h3 className="font-semibold">
                                {activity.nft.name || `${activity.nft.collection} #${activity.nft.token_id || ''}`}
                              </h3>
                              <p className="text-sm text-muted-foreground">{activity.nft.collection}</p>
                            </>
                          ) : (
                            <>
                              <h3 className="font-semibold text-muted">NFT Not Found</h3>
                              <p className="text-sm text-muted-foreground">This NFT may have been removed</p>
                            </>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {activity.from ? (
                              <>
                                <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-offset-background ring-border">
                                  <AvatarImage src={getUserDisplayInfo(activity.from).avatar} />
                                  <AvatarFallback>{getUserDisplayInfo(activity.from).initials}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium hover:text-primary cursor-pointer" onClick={() => navigate(`/profile/${activity.from.address}`)}>
                                  {getUserDisplayInfo(activity.from).name}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">Unknown User</span>
                            )}
                          </div>
                          
                          {activity.type !== 'list' && activity.type !== 'bid' && activity.type !== 'mint' && activity.to && (
                            <>
                              <span className="text-muted-foreground">→</span>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-offset-background ring-border">
                                  <AvatarImage src={getUserDisplayInfo(activity.to).avatar} />
                                  <AvatarFallback>{getUserDisplayInfo(activity.to).initials}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium hover:text-primary cursor-pointer" onClick={() => navigate(`/profile/${activity.to.address}`)}>
                                  {getUserDisplayInfo(activity.to).name}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        
                        <div className="text-right">
              {activity.price && (
                <p className="font-medium">Ξ {activity.price.toFixed(2)}</p>
              )}
              <p className="text-sm text-muted-foreground">{activity.time_ago}</p>
                        </div>
                        
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-2"
              onClick={() => window.open(`https://sepolia.etherscan.io/tx/${activity.transaction_hash}`, '_blank')}
            >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
  };

                return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">Activity</h1>
          <p className="text-muted-foreground">Track all NFT marketplace activities in real-time</p>
                        </div>
                        
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <TabsList className="grid w-full max-w-2xl grid-cols-6">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="buy">Sales</TabsTrigger>
              <TabsTrigger value="list">Listings</TabsTrigger>
              <TabsTrigger value="bid">Offers</TabsTrigger>
              <TabsTrigger value="transfer">Transfers</TabsTrigger>
              <TabsTrigger value="mint">Mints</TabsTrigger>
            </TabsList>
            
            <div className="flex gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input 
                  placeholder="Search..." 
                  className="pl-10 w-48"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                          </div>
              <Select value={timeFilter} onValueChange={handleTimeFilterChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>

          <TabsContent value={activeTab}>
            {isLoading && activities.length === 0 ? (
            <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading activities...</p>
            </div>
            ) : activities.length === 0 ? (
            <div className="text-center py-12">
                <p className="text-muted-foreground">No activities found</p>
            </div>
            ) : (
              <div className="space-y-4">
                {activities.map(renderActivityCard)}
            </div>
            )}
          </TabsContent>
        </Tabs>

        {hasMore && (
        <div className="flex justify-center mt-12">
            <Button 
              variant="outline" 
              size="lg" 
              onClick={loadMore}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Load More Activities'
              )}
          </Button>
        </div>
        )}

        {totalItems > 0 && (
          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Showing {activities.length} of {totalItems} activities
            </p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Activity;
