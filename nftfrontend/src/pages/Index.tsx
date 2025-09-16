
import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import TrendingCollections from '@/components/TrendingCollections';
import NFTCard from '@/components/NFTCard';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Zap, Users, TrendingUp, Palette, Coins } from 'lucide-react';
import { nftService, NFT } from '@/services/nftService';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';

const Index = () => {
  const { address } = useWallet();
  const navigate = useNavigate();
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [newNFTs, setNewNFTs] = useState<NFT[]>([]);
  const [trendingNFTs, setTrendingNFTs] = useState<NFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch NFTs from API
  useEffect(() => {
    const fetchNFTs = async () => {
      setIsLoading(true);
      try {
        const allNFTs = await nftService.getCombinedNFTs();
        console.log('[Index] Fetched NFTs:', allNFTs.length);
        
        // Split NFTs into different categories
         // Featured: highest priced listed NFTs
         const listed = allNFTs.filter(n => n.is_listed);
         const byPriceDesc = [...listed].sort((a, b) => (Number(b.price || 0) as number) - (Number(a.price || 0) as number));
         setFeaturedNFTs(byPriceDesc.slice(0, 8));
         // New: most recently created
         const byRecent = [...allNFTs].sort((a, b) => {
           const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
           const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
           return tB - tA;
         });
         setNewNFTs(byRecent.slice(0, 8));
         // Trending: most viewed (fallback to random)
         const byViews = [...allNFTs].sort((a, b) => (Number(b.views || 0) as number) - (Number(a.views || 0) as number));
         setTrendingNFTs(byViews.slice(0, 8));
      } catch (error) {
        console.error('[Index] Error fetching NFTs:', error);
        toast.error('Failed to load NFTs');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNFTs();
  }, []);

  const handleLikeToggle = async (nftId: string | number, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    console.log('[Index] handleLikeToggle called with:', { nftId, nftId_type: typeof nftId, newLikedState });
    
    try {
      const result = await nftService.toggleNFTLike(nftId, address);
      if (result.success) {
        // Use the actual liked state from the backend
        const actualLikedState = result.liked !== undefined ? result.liked : newLikedState;
        
        // Update all NFT arrays
        const updateNFTs = (nfts: NFT[]) => 
          nfts.map(nft => 
            nft.id === nftId 
              ? { ...nft, liked: actualLikedState }
              : nft
          );
        
        setFeaturedNFTs(updateNFTs);
        setNewNFTs(updateNFTs);
        setTrendingNFTs(updateNFTs);
        
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

  const features = [
    {
      icon: Shield,
      title: "Secure & Trusted",
      description: "Built on blockchain technology with top-tier security protocols"
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Instant transactions with minimal gas fees"
    },
    {
      icon: Users,
      title: "Global Community",
      description: "Join millions of creators and collectors worldwide"
    },
    {
      icon: Palette,
      title: "Create & Mint",
      description: "Turn your digital art into valuable NFTs with ease"
    },
    {
      icon: TrendingUp,
      title: "Market Analytics",
      description: "Real-time data and insights for informed decisions"
    },
    {
      icon: Coins,
      title: "Multiple Blockchains",
      description: "Support for Ethereum, Polygon, Solana and more"
    }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <HeroSection />
        <div className="container mx-auto px-4 py-16">
          <div className="text-center">
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
      <HeroSection />
      <TrendingCollections />

      {/* Features Section */}
      <section className="py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose NFTMarket?</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Experience the future of digital ownership with our cutting-edge NFT marketplace
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
      
      {/* Featured NFTs Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Featured NFTs</h2>
            <p className="text-muted-foreground text-lg">Hand-picked by our curators</p>
          </div>

          <Tabs defaultValue="featured" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
              <TabsTrigger value="featured">Featured</TabsTrigger>
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="trending">Trending</TabsTrigger>
            </TabsList>
            
            <TabsContent value="featured">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {featuredNFTs.map((nft) => (
                  <NFTCard
                    key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
                    title={nft.title || nft.name}
                    collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                    price={typeof nft.price === 'string' ? nft.price : (nft.price ? nft.price.toString() : '0')}
                    image={nft.image || nft.image_url}
                    tokenId={nft.token_id}
                    id={nft.id}
                    liked={likedNFTIds.has(String(nft.id))}
                    isAuction={nft.isAuction || nft.is_auction}
                    timeLeft={nft.timeLeft}
                    views={nft.views}
                    onLike={(newLikedState) => handleLikeToggle(nft.id, newLikedState)}
                    owner_address={nft.owner_address}
                    is_listed={nft.is_listed}
                  />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="new">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {newNFTs.map((nft) => (
                  <NFTCard
                    key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
                    title={nft.title || nft.name}
                    collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                    price={typeof nft.price === 'string' ? nft.price : (nft.price ? nft.price.toString() : '0')}
                    image={nft.image || nft.image_url}
                    tokenId={nft.token_id}
                    id={nft.id}
                    liked={likedNFTIds.has(String(nft.id))}
                    isAuction={nft.isAuction || nft.is_auction}
                    timeLeft={nft.timeLeft}
                    views={nft.views}
                    onLike={(newLikedState) => handleLikeToggle(nft.id, newLikedState)}
                    owner_address={nft.owner_address}
                    is_listed={nft.is_listed}
                  />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="trending">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {trendingNFTs.map((nft) => (
                  <NFTCard
                    key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
                    title={nft.title || nft.name}
                    collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                    price={typeof nft.price === 'string' ? nft.price : (nft.price ? nft.price.toString() : '0')}
                    image={nft.image || nft.image_url}
                    tokenId={nft.token_id}
                    id={nft.id}
                    liked={likedNFTIds.has(String(nft.id))}
                    isAuction={nft.isAuction || nft.is_auction}
                    timeLeft={nft.timeLeft}
                    views={nft.views}
                    onLike={(newLikedState) => handleLikeToggle(nft.id, newLikedState)}
                    owner_address={nft.owner_address}
                    is_listed={nft.is_listed}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="text-center mt-12">
            <Button size="lg" variant="outline" className="px-8" onClick={() => navigate('/marketplace')}>
              View All NFTs
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-purple-500/10 to-blue-500/10">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold">Ready to Start Your NFT Journey?</h2>
            <p className="text-muted-foreground text-lg">
              Join thousands of creators and collectors in the world's leading NFT marketplace
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 px-8" onClick={() => navigate('/create')}>
                Create Your First NFT
              </Button>
              <Button variant="outline" size="lg" className="px-8" onClick={() => navigate('/marketplace')}>
                Start Exploring
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
