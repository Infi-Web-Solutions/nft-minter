
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Users, Activity as ActivityIcon, DollarSign, Package } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiService, NFT } from '@/services/api';
import { activityService } from '@/services/activityService';

type TimeFilter = '24h' | '7d' | '30d';

interface VolumePoint {
  day: string; // label for X-axis (e.g., MM/DD)
  volume: number;
  sales: number;
}

const Stats = () => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30d');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [metrics, setMetrics] = useState({
    totalVolume: 0,
    totalSales: 0,
    activeUsers: 0,
    totalNFTs: 0,
  });

  const [volumeData, setVolumeData] = useState<VolumePoint[]>([]);
  const [topPerformers, setTopPerformers] = useState<{ name: string; volume: number; change: number }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number; color: string }[]>([]);

  const daysForFilter: Record<TimeFilter, number> = {
    '24h': 1,
    '7d': 7,
    '30d': 30,
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // We will compute top collections by summing NFT prices grouped by collection name

        // 2) NFTs: sum all prices to compute total volume and count unique owners
        let totalNFTs = 0;
        let totalVolume = 0;
        const ownerSet = new Set<string>();
        const collectionVolumes = new Map<string, number>();
        let nftPage = 1;
        let nftHasNext = true;
        const pageLimit = 100;
        while (nftHasNext && nftPage <= 100) {
          const nftsRes = await apiService.getNFTs({ page: nftPage, limit: pageLimit });
          const nfts: NFT[] = nftsRes.data || [];
          totalNFTs = nftsRes.pagination?.total_items ?? (totalNFTs + nfts.length);
          for (const nft of nfts) {
            // Sum price if present
            const p = typeof nft.price === 'number' ? nft.price : (nft.price ? parseFloat(String(nft.price)) : 0);
            if (isFinite(p)) totalVolume += p;
            if (nft.owner_address) ownerSet.add(nft.owner_address);
            const collectionName = (nft.collection || 'Uncategorized').toString();
            const prevVol = collectionVolumes.get(collectionName) || 0;
            collectionVolumes.set(collectionName, prevVol + (isFinite(p) ? p : 0));
          }
          nftHasNext = nftsRes.pagination?.has_next ?? false;
          nftPage += 1;
          // If pagination is not provided, break after first iteration
          if (!nftsRes.pagination) break;
        }

        // 3) Activities for time series + sales + active users
        const allActivities: any[] = [];
        let page = 1;
        let hasNext = true;
        while (hasNext && page <= 50) {
          const resp = await activityService.getActivities({ time_filter: timeFilter, limit: 100, page });
          allActivities.push(...(resp.data || []));
          hasNext = resp.pagination?.has_next ?? false;
          page += 1;
        }

        const now = new Date();
        const days = daysForFilter[timeFilter];
        const buckets: VolumePoint[] = Array.from({ length: days }, (_, i) => {
          const d = new Date(now);
          d.setDate(now.getDate() - (days - 1 - i));
          const label = `${d.getMonth() + 1}/${d.getDate()}`;
          return { day: label, volume: 0, sales: 0 };
        });

        const activeUserSet = new Set<string>();
        let totalSales = 0;

        for (const act of allActivities) {
          if (act.from?.address) activeUserSet.add(act.from.address);
          if (act.to?.address) activeUserSet.add(act.to.address);

          const ts = new Date(act.timestamp);
          const diffDays = Math.floor((now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24));
          // Only include within window
          if (diffDays >= 0 && diffDays < days) {
            const indexFromStart = days - 1 - diffDays; // map oldest->0 to newest->days-1
            if (act.type === 'buy') {
              const price = typeof act.price === 'number' ? act.price : parseFloat(act.price || '0');
              buckets[indexFromStart].volume += isFinite(price) ? price : 0;
              buckets[indexFromStart].sales += 1;
              totalSales += 1;
            }
          }
        }

        const top = Array.from(collectionVolumes.entries())
          .map(([name, volume]) => ({ name, volume, change: 0 }))
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 10);
        setTopPerformers(top);
        // Active users prefer owners set over activity addresses if it gives a more consistent count
        const activeUsersComputed = ownerSet.size > 0 ? ownerSet.size : activeUserSet.size;

        setMetrics({
          totalVolume,
          totalSales,
          activeUsers: activeUsersComputed,
          totalNFTs,
        });
        setVolumeData(buckets);

        // Derive category distribution from all NFTs (counts)
        // Refetch a single page with a large limit to approximate distribution if pagination total isn't available.
        const categoriesCountMap = new Map<string, number>();
        let catPage = 1;
        let catHasNext = true;
        while (catHasNext && catPage <= 5) { // cap to avoid long loops
          const res = await apiService.getNFTs({ page: catPage, limit: 200 });
          const nfts: NFT[] = res.data || [];
          nfts.forEach(n => {
            const key = (n.category || 'Others').trim() || 'Others';
            categoriesCountMap.set(key, (categoriesCountMap.get(key) || 0) + 1);
          });
          catHasNext = res.pagination?.has_next ?? false;
          catPage += 1;
          if (!res.pagination) break;
        }
        const colorPalette = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6B7280', '#22D3EE', '#A78BFA'];
        // Calculate total items for percentage calculation
        const totalItems = Array.from(categoriesCountMap.values()).reduce((sum, count) => sum + count, 0);
        
        const categoriesForChart = Array.from(categoriesCountMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name, count], idx) => ({ 
            name, 
            value: Math.round((count / totalItems) * 100), // Convert to percentage
            color: colorPalette[idx % colorPalette.length]
          }));
        setCategoryData(categoriesForChart);
      } catch (error) {
        console.error('[Stats] Failed to load market stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [timeFilter]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">Market Statistics</h1>
          <p className="text-muted-foreground">Comprehensive analytics and insights into the NFT marketplace</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Volume</p>
                  <p className="text-2xl font-bold">Ξ {metrics.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Updated
                  </div>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sales</p>
                  <p className="text-2xl font-bold">{metrics.totalSales.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Last {timeFilter}
                  </div>
                </div>
                <ActivityIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Users</p>
                  <p className="text-2xl font-bold">{metrics.activeUsers.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendingDown className="h-4 w-4" />
                    Last {timeFilter}
                  </div>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total NFTs</p>
                  <p className="text-2xl font-bold">{metrics.totalNFTs.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    All time
                  </div>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
            </TabsList>
            
            <Select value={timeFilter} onValueChange={(v: TimeFilter) => setTimeFilter(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid gap-8 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Volume Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="volume" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sales Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="sales" stroke="#3B82F6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Top Performing Collections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topPerformers.map((collection, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {index + 1}
                        </div>
                        <h3 className="font-semibold">{collection.name}</h3>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">Ξ {collection.volume}</p>
                        <p className={`text-sm ${collection.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {collection.change >= 0 ? '+' : ''}{collection.change}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collections">
            <Card>
              <CardHeader>
                <CardTitle>Collection Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topPerformers}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="volume" fill="#8B5CF6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <div className="grid gap-8 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Category Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name} ${value}%`}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Category Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {categoryData.map((category, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full" 
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="font-medium">{category.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold">{category.value}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
};

export default Stats;
