import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { 
  Heart, 
  Share2, 
  MoreHorizontal, 
  Eye, 
  TrendingUp,
  Clock,
  Users,
  DollarSign,
  Zap,
  ExternalLink,
  Copy,
  Calendar,
  ArrowLeft
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { nftService } from '@/services/nftService';
import { apiUrl } from '@/config';

const NFTDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address } = useWallet();
  const [nft, setNFT] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [imageLoading, setImageLoading] = useState(true);
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const [nftStats, setNftStats] = useState({
    views: 0,
    likes: 0,
    owners: 1,
    lastSale: 'No sales yet',
    totalVolume: '0 ETH',
    properties: []
  });

  useEffect(() => {
    if (!id) return;
    
    const fetchNFT = async () => {
      setLoading(true);
      try {
        let nftData;
        
        console.log('[NFTDetails] Fetching NFT with combined ID:', id);
        
        const res = await fetch(apiUrl(`/nfts/combined/${id}/`));
        const data = await res.json();
        if (data.success) {
          nftData = data.data;
        } else {
          toast.error(data.error || 'NFT not found');
          navigate('/');
          return;
        }
        
        setNFT(nftData);
        setImageLoading(true); // Reset image loading state
        
        // Debug image data
        console.log('[NFTDetails] NFT Data:', {
          id: nftData.id,
          name: nftData.name,
          image_url: nftData.image_url,
          token_uri: nftData.token_uri
        });
        
        // Test image URL conversion
        if (nftData.image_url) {
          const testUrl = nftData.image_url;
          console.log('[NFTDetails] Original Image URL:', testUrl);
          if (testUrl.startsWith('ipfs://')) {
            const convertedUrl = testUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
            console.log('[NFTDetails] Converted Image URL:', convertedUrl);
          }
        }
        
        // Set initial like state from NFT data
        setIsLiked(nftData.liked || false);
        
        // Fetch owner and creator profiles if addresses are available
        if (nftData.owner_address) {
          try {
            const ownerRes = await fetch(apiUrl(`/profiles/${nftData.owner_address}/`));
            if (ownerRes.ok) {
            const ownerData = await ownerRes.json();
              if (ownerData.success) {
                setOwner(ownerData.data || ownerData);
              } else {
                console.warn('Owner profile fetch returned success: false');
                // Set a fallback owner profile
                setOwner({
                  username: `User${nftData.owner_address.slice(-4)}`,
                  avatar_url: null,
                  verified: false
                });
              }
            } else {
              console.warn('Owner profile fetch failed with status:', ownerRes.status);
              // Set a fallback owner profile
              setOwner({
                username: `User${nftData.owner_address.slice(-4)}`,
                avatar_url: null,
                verified: false
              });
            }
          } catch (e) {
            console.error('Failed to fetch owner profile:', e);
            // Set a fallback owner profile
            setOwner({
              username: `User${nftData.owner_address.slice(-4)}`,
              avatar_url: null,
              verified: false
            });
          }
        }
        
        if (nftData.creator_address) {
          try {
            const creatorRes = await fetch(apiUrl(`/profiles/${nftData.creator_address}/`));
            if (creatorRes.ok) {
            const creatorData = await creatorRes.json();
              if (creatorData.success) {
                setCreator(creatorData.data || creatorData);
              } else {
                console.warn('Creator profile fetch returned success: false');
                // Set a fallback creator profile
                setCreator({
                  username: `User${nftData.creator_address.slice(-4)}`,
                  avatar_url: null,
                  verified: false
                });
              }
            } else {
              console.warn('Creator profile fetch failed with status:', creatorRes.status);
              // Set a fallback creator profile
              setCreator({
                username: `User${nftData.creator_address.slice(-4)}`,
                avatar_url: null,
                verified: false
              });
            }
          } catch (e) {
            console.error('Failed to fetch creator profile:', e);
            // Set a fallback creator profile
            setCreator({
              username: `User${nftData.creator_address.slice(-4)}`,
              avatar_url: null,
              verified: false
            });
          }
        }
        
        // Fetch NFT statistics and properties
        await fetchNFTStats(nftData);
        
      } catch (e) {
        console.error('Error fetching NFT:', e);
        toast.error('Failed to load NFT');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    fetchNFT();
  }, [id, navigate]);

  const fetchNFTStats = async (nftData: any) => {
    try {
      // Fetch NFT statistics from backend
      const statsRes = await fetch(apiUrl(`/nfts/${nftData.id}/stats/`));
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) {
          setNftStats({
            views: statsData.data.views || 0,
            likes: statsData.data.likes || 0,
            owners: statsData.data.owners || 1,
            lastSale: statsData.data.last_sale || 'No sales yet',
            totalVolume: statsData.data.total_volume || '0 ETH',
            properties: statsData.data.properties || []
          });
        }
      }
    } catch (e) {
      console.error('Failed to fetch NFT stats:', e);
    }
  };

  useEffect(() => {
    if (!id) return;
    const fetchActivity = async () => {
      try {
        const activityId = id.startsWith('local_') ? id.replace('local_', '') : id;
        const res = await fetch(apiUrl(`/activities/?nft=${activityId}`));
        const data = await res.json();
        if (data.success) setActivity(data.data);
      } catch (e) { 
        console.error('Failed to fetch activity:', e);
      }
    };
    fetchActivity();
  }, [id]);

  // Reset gateway index when NFT changes
  useEffect(() => {
    if (nft) {
      setCurrentGatewayIndex(0);
      setImageLoading(true);
      
      // Track view when NFT loads
      trackNFTView();
    }
  }, [nft?.id]);

  const trackNFTView = async () => {
    if (!nft?.id) return;
    
    try {
      const response = await fetch(apiUrl(`/nfts/${nft.id}/track-view/`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          viewer_address: address || null
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[NFTDetails] View tracked:', data.view_count);
      }
    } catch (error) {
      console.error('[NFTDetails] Failed to track view:', error);
    }
  };

  const handleLikeToggle = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!nft) return;

    try {
      const result = await nftService.toggleNFTLike(nft.id, address);
      if (result.success) {
        setIsLiked(result.liked || false);
        setNftStats(prev => ({
          ...prev,
          likes: typeof result.like_count === 'number' ? result.like_count : prev.likes
        }));
        toast.success(result.liked ? 'Added to favorites' : 'Removed from favorites');
      } else {
        toast.error(result.error || 'Failed to update favorite status');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update favorite status');
    }
  };

  const handleBuyNow = () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    toast.info('Buy functionality coming soon!');
  };

  const handleMakeOffer = () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    toast.info('Make offer functionality coming soon!');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading NFT details...</p>
        </div>
      </div>
    </div>
  );

  if (!nft) return null;

  // Format price for display
  const formatPrice = (price: any) => {
    if (!price || price === '0') return 'Not for sale';
    return `Ξ${typeof price === 'string' ? price : price.toString()}`;
  };

  // Get real NFT image URL with proper IPFS handling and fallback gateways
  const getNFTImageUrl = () => {
    if (!nft) return '';
    
    let imageUrl = nft.image_url || '';
    
    // If no direct image URL, try to get from blockchain data
    if (!imageUrl && nft.blockchain_data && nft.blockchain_data.image) {
      imageUrl = nft.blockchain_data.image;
    }
    
    // Handle IPFS URLs with multiple gateway fallbacks
    if (imageUrl && imageUrl.startsWith('ipfs://')) {
      const ipfsHash = imageUrl.replace('ipfs://', '');
      const gateways = [
        `https://ipfs.io/ipfs/${ipfsHash}`,
        `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
        `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
        `https://dweb.link/ipfs/${ipfsHash}`,
        `https://ipfs.infura.io/ipfs/${ipfsHash}`
      ];
      
      // Use current gateway index or default to first
      const selectedGateway = gateways[currentGatewayIndex] || gateways[0];
      imageUrl = selectedGateway;
      
      console.log('[NFTDetails] IPFS URL converted to:', imageUrl);
      console.log('[NFTDetails] Using gateway index:', currentGatewayIndex);
      console.log('[NFTDetails] Available gateways:', gateways);
    }
    
    // Handle other IPFS formats
    if (imageUrl && imageUrl.includes('ipfs/') && !imageUrl.startsWith('http')) {
      imageUrl = `https://ipfs.io/${imageUrl}`;
    }
    
    // Ensure we have a valid URL
    if (!imageUrl || imageUrl === '') {
      console.log('[NFTDetails] No valid image URL found, using fallback');
      return '';
    }
    
    console.log('[NFTDetails] Final Image URL:', imageUrl);
    return imageUrl;
  };

  // Get real profile image URL
  const getProfileImageUrl = (profile: any) => {
    return profile?.avatar_url || profile?.profile_image || '';
  };

  // Get profile display name
  const getProfileDisplayName = (profile: any, address: string) => {
    return profile?.username || profile?.name || address?.slice(0, 6) + '...' + address?.slice(-4) || 'Unknown';
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Back Button */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Cover Image */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <img 
          src={getNFTImageUrl()} 
          alt="NFT Cover" 
          className="w-full h-full object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            const currentSrc = img.src;
            console.error('[NFTDetails] Cover image failed to load:', currentSrc);
            
            // Check if this is an IPFS URL and we can try another gateway
            if (currentSrc.includes('ipfs.io') || currentSrc.includes('gateway.pinata.cloud') || 
                currentSrc.includes('cloudflare-ipfs.com') || currentSrc.includes('dweb.link') || 
                currentSrc.includes('ipfs.infura.io')) {
              
              // Try next gateway
              const nextGatewayIndex = currentGatewayIndex + 1;
              if (nextGatewayIndex < 5) { // We have 5 gateways
                console.log('[NFTDetails] Trying next gateway for cover, index:', nextGatewayIndex);
                setCurrentGatewayIndex(nextGatewayIndex);
                
                                         // Force re-render by updating the image URL
                         const ipfsHash = nft?.image_url?.replace('ipfs://', '') || '';
                const gateways = [
                  `https://ipfs.io/ipfs/${ipfsHash}`,
                  `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
                  `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                  `https://dweb.link/ipfs/${ipfsHash}`,
                  `https://ipfs.infura.io/ipfs/${ipfsHash}`
                ];
                
                if (gateways[nextGatewayIndex]) {
                  img.src = gateways[nextGatewayIndex];
                  return; // Don't set fallback yet, try the new gateway
                }
              }
            }
            
            // If all gateways failed or it's not an IPFS URL, use fallback
            img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBDb3ZlcjwvdGV4dD48L3N2Zz4=';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main NFT Display */}
          <div className="lg:col-span-2 space-y-6">
            {/* NFT Image Card */}
            <Card className="glass-card p-6 transition-smooth hover:glow-effect border-0">
              <div className="relative aspect-square rounded-xl overflow-hidden mb-6">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  </div>
                )}
                <img 
                  src={getNFTImageUrl()} 
                  alt={nft.name}
                  className="w-full h-full object-cover transition-smooth hover:scale-105"
                  onLoad={() => setImageLoading(false)}
                  onError={(e) => {
                    setImageLoading(false);
                    const img = e.currentTarget;
                    const currentSrc = img.src;
                    console.error('[NFTDetails] Image failed to load:', currentSrc);
                    
                    // Check if this is an IPFS URL and we can try another gateway
                    if (currentSrc.includes('ipfs.io') || currentSrc.includes('gateway.pinata.cloud') || 
                        currentSrc.includes('cloudflare-ipfs.com') || currentSrc.includes('dweb.link') || 
                        currentSrc.includes('ipfs.infura.io')) {
                      
                      // Try next gateway
                      const nextGatewayIndex = currentGatewayIndex + 1;
                      if (nextGatewayIndex < 5) { // We have 5 gateways
                        console.log('[NFTDetails] Trying next gateway, index:', nextGatewayIndex);
                        setCurrentGatewayIndex(nextGatewayIndex);
                        
                        // Force re-render by updating the image URL
                        const ipfsHash = nft?.image_url?.replace('ipfs://', '') || '';
                        const gateways = [
                          `https://ipfs.io/ipfs/${ipfsHash}`,
                          `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
                          `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                          `https://dweb.link/ipfs/${ipfsHash}`,
                          `https://ipfs.infura.io/ipfs/${ipfsHash}`
                        ];
                        
                        if (gateways[nextGatewayIndex]) {
                          img.src = gateways[nextGatewayIndex];
                          return; // Don't set fallback yet, try the new gateway
                        }
                      }
                    }
                    
                    // If all gateways failed or it's not an IPFS URL, use fallback
                    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBJbWFnZTwvdGV4dD48L3N2Zz4=';
                  }}
                />
                <div className="absolute top-4 right-4 flex gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/80 backdrop-blur-md hover:bg-background/90"
                    onClick={handleLikeToggle}
                  >
                    <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/80 backdrop-blur-md hover:bg-background/90"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/80 backdrop-blur-md hover:bg-background/90"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* NFT Title and Stats */}
              <div className="space-y-4">
                <div>
                  <Badge variant="secondary" className="mb-2">
                    {typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                  </Badge>
                  <h1 className="text-3xl font-bold gradient-text mb-2">
                    {nft.name}
                  </h1>
                  <p className="text-muted-foreground leading-relaxed">
                    {nft.description || 'No description available'}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>{nftStats.views.toLocaleString()} views</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    <span>{nftStats.likes.toLocaleString()} likes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{nftStats.owners} owners</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Details Tabs */}
            <Card className="glass-card p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="properties">Properties</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6 space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-card/50 rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Token ID</div>
                      <div className="font-semibold">{nft.token_id}</div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Blockchain</div>
                      <div className="font-semibold">Ethereum</div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Last Sale</div>
                      <div className="font-semibold text-green-500">{nftStats.lastSale}</div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Total Volume</div>
                      <div className="font-semibold text-blue-500">{nftStats.totalVolume}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3">Contract Address</h3>
                    <div className="flex items-center gap-2 p-3 bg-card/50 rounded-lg">
                      <code className="text-sm text-muted-foreground flex-1">
                        {nft.owner_address || '0x0000000000000000000000000000000000000000'}
                      </code>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => copyToClipboard(nft.owner_address || '0x0000000000000000000000000000000000000000')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="properties" className="mt-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {nftStats.properties.length > 0 ? (
                      nftStats.properties.map((property: any, index: number) => (
                        <div key={index} className="bg-card/50 rounded-lg p-4 text-center">
                          <div className="text-sm text-accent-foreground font-medium mb-1">
                            {property.trait_type || property.trait}
                          </div>
                          <div className="font-semibold mb-2">{property.value}</div>
                          {property.rarity && (
                            <Badge variant="outline" className="text-xs">
                              {property.rarity} rare
                            </Badge>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center text-muted-foreground py-8">
                        No properties available for this NFT.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-6">
                  <div className="space-y-4">
                    {activity.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        No activity yet.
                      </div>
                    ) : (
                      activity.map((act: any, index) => (
                        <div key={index} className="flex items-center gap-4 p-4 bg-card/50 rounded-lg">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            {act.type === "Minted" ? (
                              <Zap className="h-4 w-4 text-primary" />
                            ) : (
                              <DollarSign className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{act.type}</span>
                              {act.price && (
                                <Badge variant="secondary">{act.price}</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {act.description || `${act.type} - ${act.nft_name || ''}`}
                            </div>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <div>{act.timestamp ? new Date(act.timestamp).toLocaleDateString() : ''}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Price and Actions */}
            <Card className="glass-card p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Current Price</div>
                  <div className="text-3xl font-bold text-green-500">{formatPrice(nft.price)}</div>
                  <div className="text-lg text-muted-foreground">
                    {nft.price && nft.price !== '0' ? `$${(parseFloat(nft.price.toString()) * 1700).toFixed(2)}` : 'Not for sale'}
                  </div>
                </div>

                {nft.is_listed && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      className="bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 transition-smooth"
                      onClick={handleBuyNow}
                    >
                      Buy Now
                    </Button>
                    <Button variant="outline" onClick={handleMakeOffer}>
                      Make Offer
                    </Button>
                  </div>
                )}

                <div className="text-center">
                  <Button variant="ghost" className="text-accent-foreground">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    View Price History
                  </Button>
                </div>
              </div>
            </Card>

            {/* Creator Info */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Creator</h3>
              <div 
                className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                onClick={() => navigate(`/profile/${nft.creator_address}`)}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={getProfileImageUrl(creator)} />
                  <AvatarFallback>
                    {getProfileDisplayName(creator, nft.creator_address).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    {getProfileDisplayName(creator, nft.creator_address)}
                    {creator?.verified && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground break-all overflow-hidden text-ellipsis max-w-[200px]">
                    {nft.creator_address}
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                Follow Creator
              </Button>
        </Card>

            {/* Current Owner Info */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Current Owner</h3>
              <div 
                className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                onClick={() => navigate(`/profile/${nft.owner_address}`)}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={getProfileImageUrl(owner)} />
                  <AvatarFallback>
                    {getProfileDisplayName(owner, nft.owner_address).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    {getProfileDisplayName(owner, nft.owner_address)}
                    {owner?.verified && (
                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                    </div>
                  <div className="text-sm text-muted-foreground break-all overflow-hidden text-ellipsis max-w-[200px]">
                    {nft.owner_address}
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Owned Since</span>
                  <span>{nft.created_at ? new Date(nft.created_at).toLocaleDateString() : 'Unknown'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total NFTs Owned</span>
                  <span className="font-semibold">{owner?.total_nfts || 'Unknown'}</span>
                </div>
              </div>

              <Button variant="outline" className="w-full">
                View Collection
              </Button>
            </Card>

            {/* Minting Information */}
            <Card className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Minting Details</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Minted on</span>
                  <span className="font-medium">
                    {nft.created_at ? new Date(nft.created_at).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">
                    {nft.created_at ? new Date(nft.created_at).toLocaleTimeString() : 'Unknown'}
                  </span>
                </div>
              </div>
              </Card>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default NFTDetails;