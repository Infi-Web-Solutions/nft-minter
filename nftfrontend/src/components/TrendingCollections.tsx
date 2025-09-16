import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { apiService, Collection, NFT } from '@/services/api';

interface UICollection {
  rank: number;
  name: string;
  floorPrice: number;
  volume: number;
  items: number;
  change?: number; // optional percent change
}

const TrendingCollections = () => {
  const [collections, setCollections] = useState<UICollection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Try backend trending endpoint first
        const trending = await apiService.getTrendingCollections();
        let list: UICollection[] = [];
        if (trending?.data?.length) {
          list = trending.data
            .map((c: Collection, idx: number) => ({
              rank: idx + 1,
              name: c.name,
              floorPrice: Number(c.floor_price || 0),
              volume: Number(c.total_volume || 0),
              items: Number(c.total_items || 0),
            }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 4);
        } else {
          // Fallback: derive from NFTs
          const page1 = await apiService.getNFTs({ page: 1, limit: 200 });
          const nfts: NFT[] = page1.data || [];
          const grouped = new Map<string, { volume: number; items: number; floor: number }>();
          for (const n of nfts) {
            const key = (n.collection || 'Uncategorized').toString();
            const price = typeof n.price === 'number' ? n.price : (n.price ? parseFloat(String(n.price)) : 0);
            const current = grouped.get(key) || { volume: 0, items: 0, floor: Number.POSITIVE_INFINITY };
            grouped.set(key, {
              volume: current.volume + (isFinite(price) ? price : 0),
              items: current.items + 1,
              floor: Math.min(current.floor, isFinite(price) && price > 0 ? price : current.floor),
            });
          }
          list = Array.from(grouped.entries())
            .map(([name, v], idx) => ({
              rank: idx + 1,
              name,
              floorPrice: v.floor === Number.POSITIVE_INFINITY ? 0 : v.floor,
              volume: v.volume,
              items: v.items,
            }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 4);
        }
        setCollections(list);
      } catch (e) {
        setCollections([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Trending Collections</h2>
          <p className="text-muted-foreground text-lg">Top collections by volume</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <div className="h-5 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))
          ) : (
            collections.map((collection) => (
              <Card key={collection.rank} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {collection.rank}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{collection.name}</h3>
                        <p className="text-xs text-muted-foreground">{collection.items} items</p>
                      </div>
                    </div>
                    {collection.change !== undefined && (
                      <Badge variant={collection.change >= 0 ? 'default' : 'destructive'} className="flex items-center space-x-1">
                        {collection.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        <span className="text-xs">{collection.change.toFixed(1)}%</span>
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Floor Price</span>
                      <span className="font-medium flex items-center">
                        <span className="text-xs mr-1">Ξ</span>
                        {collection.floorPrice.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Volume</span>
                      <span className="font-medium flex items-center">
                        <span className="text-xs mr-1">Ξ</span>
                        {collection.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TrendingCollections;
