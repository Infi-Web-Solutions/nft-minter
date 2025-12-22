import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, TrendingUp, Users, DollarSign, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiUrl, mediaUrl } from '@/config';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Offer {
  id: number;
  nft_id: number;
  nft_name: string;
  nft_image: string;
  offerer_username: string;
  offerer_avatar: string;
  from_address: string;
  to_address: string;
  price: number;
  timestamp: string;
  transaction_hash: string;
}

const AdminOffers = () => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('price-desc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalOffers: 0,
    totalValue: 0,
    avgPrice: 0,
    pendingOffers: 0,
  });

  useEffect(() => {
    fetchAllOffers();
  }, []);

  const fetchAllOffers = async () => {
    setLoading(true);
    try {
      // Fetch activities with bid type (offers)
      const response = await fetch(apiUrl('/activities/?type=bid&limit=1000'));
      const data = await response.json();

      if (data.success) {
        const offersList: Offer[] = data.data.map((activity: any) => ({
          id: activity.id,
          nft_id: activity.nft?.id,
          nft_name: activity.nft?.name,
          nft_image: activity.nft?.image_url,
          offerer_username: activity.from?.name || `User${activity.from?.address?.slice(-4)}`,
          offerer_avatar: activity.from?.avatar,
          from_address: activity.from?.address,
          to_address: activity.to?.address,
          price: activity.price || 0,
          timestamp: activity.timestamp,
          transaction_hash: activity.transaction_hash,
        }));

        setOffers(offersList);

        // Calculate stats
        const totalValue = offersList.reduce((sum, offer) => sum + offer.price, 0);
        const avgPrice = offersList.length > 0 ? totalValue / offersList.length : 0;

        setStats({
          totalOffers: offersList.length,
          totalValue,
          avgPrice,
          pendingOffers: offersList.length, // All are pending until accepted
        });
      }
    } catch (error) {
      console.error('Failed to fetch offers:', error);
      toast.error('Failed to load offers');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (offers: Offer[]) => {
    const sorted = [...offers];
    switch (sortBy) {
      case 'price-desc':
        return sorted.sort((a, b) => b.price - a.price);
      case 'price-asc':
        return sorted.sort((a, b) => a.price - b.price);
      case 'recent':
        return sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      default:
        return sorted;
    }
  };

  const handleFilter = (offers: Offer[]) => {
    let filtered = offers;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (offer) =>
          offer.nft_name?.toLowerCase().includes(query) ||
          offer.offerer_username?.toLowerCase().includes(query) ||
          offer.from_address?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const displayedOffers = handleSort(handleFilter(offers));

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground animate-pulse">Loading offers...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-8 hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Offers Management</h1>
          <p className="text-muted-foreground">Monitor and manage all NFT offers on the platform</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Offers</p>
                  <p className="text-3xl font-bold">{stats.totalOffers}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Value</p>
                  <p className="text-3xl font-bold">Ξ{stats.totalValue.toFixed(4)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Average Price</p>
                  <p className="text-3xl font-bold">Ξ{stats.avgPrice.toFixed(4)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Pending</p>
                  <p className="text-3xl font-bold">{stats.pendingOffers}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="bg-card/50 backdrop-blur-sm mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Search</label>
                <Input
                  placeholder="Search by NFT name or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-background/50"
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Sort By</label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price-desc">Highest Price</SelectItem>
                    <SelectItem value="price-asc">Lowest Price</SelectItem>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Status</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Offers</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Offers Table */}
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Recent Offers</CardTitle>
            <CardDescription>Showing {displayedOffers.length} offers</CardDescription>
          </CardHeader>
          <CardContent>
            {displayedOffers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No offers found
              </div>
            ) : (
              <div className="space-y-4">
                {displayedOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="flex items-center gap-4 p-4 bg-background/50 rounded-lg hover:bg-background transition-colors"
                  >
                    {/* NFT Image */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                      {offer.nft_image && (
                        <img
                          src={mediaUrl(offer.nft_image)}
                          alt={offer.nft_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'https://via.placeholder.com/64';
                          }}
                        />
                      )}
                    </div>

                    {/* NFT and Offerer Info */}
                    <div className="flex-1">
                      <div className="mb-2">
                        <p className="font-semibold">{offer.nft_name}</p>
                        <p className="text-sm text-muted-foreground">Token #{offer.nft_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={offer.offerer_avatar} />
                          <AvatarFallback>
                            {offer.offerer_username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">
                          {offer.offerer_username}
                        </span>
                      </div>
                    </div>

                    {/* Price and Time */}
                    <div className="text-right">
                      <Badge className="mb-2 bg-primary/10 text-primary">
                        Ξ{offer.price.toFixed(4)}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {new Date(offer.timestamp).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/nft/${offer.nft_id}`)}
                      >
                        View NFT
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
};

export default AdminOffers;
