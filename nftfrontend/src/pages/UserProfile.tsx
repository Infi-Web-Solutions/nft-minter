import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Share2, 
  Copy, 
  Heart, 
  UserPlus, 
  UserCheck,
  Image as ImageIcon,
  Package,
  ExternalLink
} from 'lucide-react';
import NFTCard from '@/components/NFTCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';
import { nftService } from '@/services/nftService';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';
import { profileService, ProfileData } from '../api/useInfo';

const UserProfile = () => {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const navigate = useNavigate();
  const { address } = useWallet();
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('collected');
  const [collectedNFTs, setCollectedNFTs] = useState<any[]>([]);
  const [createdNFTs, setCreatedNFTs] = useState<any[]>([]);
  const [likedNFTs, setLikedNFTs] = useState<any[]>([]);
  
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();

  const isOwnProfile = address?.toLowerCase() === walletAddress?.toLowerCase();

  // Fetch profile data
  useEffect(() => {
    if (!walletAddress) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const profileData = await profileService.getProfile(walletAddress);
        console.log("profileData", profileData)
        if (profileData) {
          setProfile(profileData);
          
          // Small delay to ensure profile is fully loaded before refreshing NFTs
          setTimeout(async () => {
            const nfts = await profileService.getCollectedNFTs(walletAddress);
            setCollectedNFTs(nfts.map(mapNFTData));
          }, 500);
        } else {
          toast.error('Profile not found');
          navigate('/');
        }
      } catch (error) {
        console.error('[UserProfile] Error loading profile:', error);
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [walletAddress, navigate]);

  // Fetch social data
  useEffect(() => {
    if (!walletAddress) return;

    const fetchSocialData = async () => {
      const socialData = await profileService.getSocialData(walletAddress, address);
      setFollowersCount(socialData.followersCount);
      setFollowingCount(socialData.followingCount);
      setIsFollowing(socialData.isFollowing);
    };

    fetchSocialData();
  }, [walletAddress, address]);

  // Fetch NFTs based on active tab
  useEffect(() => {
    if (!walletAddress) return;

    const fetchNFTs = async () => {
      try {
        console.log(`[UserProfile] Fetching ${activeTab} NFTs for wallet: ${walletAddress}`);
        
        switch (activeTab) {
          case 'collected':
            const collected = await profileService.getCollectedNFTs(walletAddress);
            setCollectedNFTs(collected.map(mapNFTData));
            break;
            
          case 'created':
            const created = await profileService.getCreatedNFTs(walletAddress);
            setCreatedNFTs(created.map(mapNFTData));
            break;
            
          case 'liked':
            if (isOwnProfile) {
              const liked = await profileService.getLikedNFTs(walletAddress);
              setLikedNFTs(liked.map(mapNFTData));
            }
            break;
        }
      } catch (error) {
        console.error(`[UserProfile] Failed to fetch ${activeTab} data:`, error);
      }
    };

    fetchNFTs();
  }, [walletAddress, activeTab, isOwnProfile]);

  // Handle follow toggle
  const handleFollowToggle = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (isOwnProfile) {
      toast.error('You cannot follow yourself');
      return;
    }

    const result = await profileService.toggleFollow(
      walletAddress!,
      address,
      isFollowing
    );

    if (result.success) {
      setIsFollowing(result.isFollowing);
      setFollowersCount(result.followersCount);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Share profile
  const shareProfile = () => {
    const url = `${window.location.origin}/profile/${walletAddress}`;
    if (navigator.share) {
      navigator.share({
        title: `${profileService.getDisplayName(profile, walletAddress)} Profile`,
        url: url
      });
    } else {
      copyToClipboard(url);
    }
  };

  // Map NFT data to NFTCard props
  const mapNFTData = (nft: any) => {
    return {
      ...nft,
      image: nft.image_url,
      title: nft.name,
      price: nft.price?.toString() || '0',
      collection: nft.collection || 'Unknown Collection',
      tokenId: nft.token_id,
      owner_address: nft.owner_address,
      is_listed: nft.is_listed,
      id: nft.id,
      liked: likedNFTIds.has(String(nft.id)) || nft.liked || false,
    };
  };

  // Handle like toggle
  const handleLikeToggle = async (nftId: string | number, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      const result = await nftService.toggleNFTLike(nftId, address);
      if (result.success) {
        const actualLiked = result.liked !== undefined ? result.liked : newLikedState;
        const updater = (list: any[]) => 
          list.map((n) => (n.id === nftId ? { ...n, liked: actualLiked } : n));
        
        setCollectedNFTs(updater);
        setCreatedNFTs(updater);
        setLikedNFTs(updater);
        await refreshLikedNFTs();
        toast.success(actualLiked ? 'Added to favorites' : 'Removed from favorites');
      } else {
        toast.error(result.error || 'Failed to update like status');
      }
    } catch (e) {
      console.error('Failed to toggle like:', e);
      toast.error('Failed to update like status');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  // Profile not found
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Profile not found</p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Cover Image */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <img 
          src={profileService.getBannerImageUrl(profile)} 
          alt="Profile Cover" 
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI0MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzM3NDE1MSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qcm9maWxlIENvdmVyPC90ZXh0Pjwvc3ZnPg==';
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Profile Info */}
          <div className="lg:w-1/3">
            <Card className="glass-card p-6">
              <div className="text-center mb-6">
                {/* <Avatar className="h-24 w-24 mx-auto mb-4">
                  <AvatarFallback className="text-2xl">
                    {profileService.getDisplayName(profile, walletAddress).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar> */}
                    <Avatar className="h-24 w-24 mx-auto mb-4">
                  {profile.avatar_url && (
                    <img 
                      src={profile.avatar_url} 
                      alt="Profile Avatar"
                      className="h-full w-full object-cover rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  {/* <AvatarFallback className="text-2xl">
                    {profileService.getDisplayName(profile, walletAddress).slice(0, 2).toUpperCase()}
                  </AvatarFallback> */}
                </Avatar>
                
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold">
                    {profileService.getDisplayName(profile, walletAddress)}
                  </h1>
                  {profile.verified && (
                    <Badge variant="success" className="text-xs">Verified</Badge>
                  )}
                </div>
                
                <p className="text-muted-foreground mb-4 text-sm break-all">{walletAddress}</p>
                
                {profile.bio && (
                  <p className="text-sm text-muted-foreground mb-4">{profile.bio}</p>
                )}

                {profile.total_volume > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Total Volume: {profile.total_volume} ETH
                  </p>
                )}

                {/* Social Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-lg font-semibold">{profile.total_collected}</div>
                    <div className="text-xs text-muted-foreground">Collected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">{profile.total_created}</div>
                    <div className="text-xs text-muted-foreground">Created</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">{followersCount}</div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  {!isOwnProfile && (
                    <Button 
                      onClick={handleFollowToggle}
                      className={`w-full ${isFollowing ? 'bg-muted text-muted-foreground' : 'bg-primary'}`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="h-4 w-4 mr-2" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Follow
                        </>
                      )}
                    </Button>
                  )}
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => copyToClipboard(walletAddress!)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={shareProfile}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>
                </div>

                {/* Social Links */}
                {(profile.website || profile.twitter || profile.instagram || profile.discord) && (
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="text-sm font-semibold mb-3">Social Links</h3>
                    <div className="space-y-2">
                      {profile.website && (
                        <a 
                          href={profile.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Website
                        </a>
                      )}
                      {profile.twitter && (
                        <a 
                          href={`https://twitter.com/${profile.twitter}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Twitter
                        </a>
                      )}
                      {profile.instagram && (
                        <a 
                          href={`https://instagram.com/${profile.instagram}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Instagram
                        </a>
                      )}
                      {profile.discord && (
                        <a 
                          href={`https://discord.gg/${profile.discord}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Discord
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Content Tabs */}
          <div className="lg:w-2/3">
            <Card className="glass-card">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="collected" className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Collected
                  </TabsTrigger>
                  <TabsTrigger value="created" className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Created
                  </TabsTrigger>
                  {isOwnProfile && (
                    <TabsTrigger value="liked" className="flex items-center gap-2">
                      <Heart className="h-4 w-4" />
                      Liked
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="collected" className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {collectedNFTs.length === 0 ? (
                      <div className="col-span-full text-center text-muted-foreground py-8">
                        No collected NFTs yet.
                      </div>
                    ) : (
                      collectedNFTs.map((nft: any) => (
                        <NFTCard 
                          key={nft.id} 
                          {...nft} 
                          liked={likedNFTIds.has(String(nft.id)) || nft.liked}
                          onLike={(newLiked) => handleLikeToggle(nft.id, newLiked)}
                          onClick={() => navigate(`/nft/${nft.id}`)}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="created" className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {createdNFTs.length === 0 ? (
                      <div className="col-span-full text-center text-muted-foreground py-8">
                        No created NFTs yet.
                      </div>
                    ) : (
                      createdNFTs.map((nft: any) => (
                        <NFTCard
                          key={nft.id}
                          {...nft}
                          liked={likedNFTIds.has(String(nft.id)) || nft.liked}
                          onLike={(newLiked) => handleLikeToggle(nft.id, newLiked)}
                          onClick={() => navigate(`/nft/${nft.id}`)}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                {isOwnProfile && (
                  <TabsContent value="liked" className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {likedNFTs.length === 0 ? (
                        <div className="col-span-full text-center text-muted-foreground py-8">
                          No liked NFTs yet.
                        </div>
                      ) : (
                        likedNFTs.map((nft: any) => (
                          <NFTCard
                            key={nft.id}
                            {...nft}
                            liked={likedNFTIds.has(String(nft.id))}
                            onLike={(newLiked) => handleLikeToggle(nft.id, newLiked)}
                            onClick={() => navigate(`/nft/${nft.id}`)}
                          />
                        ))
                      )}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default UserProfile;