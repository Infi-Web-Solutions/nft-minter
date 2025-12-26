import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, TrendingUp, User, DollarSign, Clock } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiUrl, mediaUrl } from '@/config';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';

interface Offer {
  id: number;
  nft_id: number;
  nft_name: string;
  nft_image: string;
  offerer_username: string;
  offerer_avatar: string;
  recipient_username: string;
  recipient_avatar: string;
  from_address: string;
  to_address: string;
  price: number;
  timestamp: string;
  transaction_hash: string;
}

const AdminOffers = () => {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('price-desc');
  const [activeTab, setActiveTab] = useState('received');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (address) {
      fetchAllOffers();
    }
  }, [address]);

  const fetchAllOffers = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/activities/?type=bid&limit=1000&user=${address}`));
      const data = await response.json();

      if (data.success) {
        const offersList: Offer[] = data.data.map((activity: any) => ({
          id: activity.id,
          nft_id: activity.nft?.id,
          nft_name: activity.nft?.name,
          nft_image: activity.nft?.image_url,
          offerer_username: activity.from?.username || activity.from?.name || `User${activity.from?.address?.slice(-4)}`,
          offerer_avatar: activity.from?.avatar_url || activity.from?.avatar,
          recipient_username: activity.to?.username || activity.to?.name || `User${activity.to?.address?.slice(-4)}`,
          recipient_avatar: activity.to?.avatar_url || activity.to?.avatar,
          from_address: activity.from?.address,
          to_address: activity.to?.address,
          price: activity.price || 0,
          timestamp: activity.timestamp,
          transaction_hash: activity.transaction_hash,
        }));

        setOffers(offersList);
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

    if (address) {
      if (activeTab === 'received') {
        filtered = filtered.filter(offer => offer.to_address?.toLowerCase() === address.toLowerCase());
      } else if (activeTab === 'made') {
        filtered = filtered.filter(offer => offer.from_address?.toLowerCase() === address.toLowerCase());
      }
    }

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

  const currentStats = {
    totalOffers: displayedOffers.length,
    totalValue: displayedOffers.reduce((sum, offer) => sum + offer.price, 0),
    avgPrice: displayedOffers.length > 0
      ? displayedOffers.reduce((sum, offer) => sum + offer.price, 0) / displayedOffers.length
      : 0,
    pendingOffers: displayedOffers.length,
  };

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

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">My Offers</h1>
          <p className="text-muted-foreground">Monitor and manage offers related to your NFTs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Offers</p>
                  <p className="text-3xl font-bold">{currentStats.totalOffers}</p>
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
                  <p className="text-3xl font-bold">Ξ{currentStats.totalValue.toFixed(4)}</p>
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
                  <p className="text-3xl font-bold">Ξ{currentStats.avgPrice.toFixed(4)}</p>
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
                  <p className="text-3xl font-bold">{currentStats.pendingOffers}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50 backdrop-blur-sm mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="received">Offers Received</TabsTrigger>
            <TabsTrigger value="made">Offers Made</TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-0">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Offers Received</CardTitle>
                <CardDescription>Offers made by others on NFTs you own</CardDescription>
              </CardHeader>
              <CardContent>
                {renderOffersList(displayedOffers)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="made" className="mt-0">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Offers Made</CardTitle>
                <CardDescription>Offers you have made on other NFTs</CardDescription>
              </CardHeader>
              <CardContent>
                {renderOffersList(displayedOffers)}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );

  function renderOffersList(offers: Offer[]) {
    if (offers.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          No offers found
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {offers.map((offer) => {
          const isReceived = activeTab === 'received';
          const displayUser = {
            name: isReceived ? offer.offerer_username : offer.recipient_username,
            avatar: isReceived ? offer.offerer_avatar : offer.recipient_avatar,
            label: isReceived ? 'From' : 'To'
          };

          return (
            <div
              key={offer.id}
              className="flex items-center gap-6 p-5 bg-background/50 rounded-xl hover:bg-background/80 transition-all border border-transparent hover:border-primary/20"
            >
              <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted shadow-inner">
                {offer.nft_image ? (
                  <img
                    src={mediaUrl(offer.nft_image)}
                    alt={offer.nft_name}
                    className="w-full h-full object-cover transition-transform hover:scale-110"
                    onError={(e) => {
                      e.currentTarget.src = 'https://placehold.co/400x400/1a1a1a/ffffff?text=No+Image';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin opacity-20" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="mb-3">
                  <p className="font-bold text-lg truncate">{offer.nft_name}</p>
                  <p className="text-sm text-muted-foreground font-medium">Token #{offer.nft_id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={displayUser.avatar ? mediaUrl(displayUser.avatar) : undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground font-medium">
                      {displayUser.label}
                    </span>
                    <span className="text-sm font-semibold truncate">
                      {displayUser.name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right flex flex-col items-end gap-2">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none px-3 py-1 text-base font-bold">
                  Ξ{offer.price.toFixed(4)}
                </Badge>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <Clock className="h-3 w-3" />
                  {new Date(offer.timestamp).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>

              <div className="flex items-center pl-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/nft/${offer.nft_id}`)}
                  className="rounded-full px-4 hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  View NFT
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
};

export default AdminOffers;
