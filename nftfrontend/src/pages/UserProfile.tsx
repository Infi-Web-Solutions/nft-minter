import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
import { useLikes } from '@/contexts/LikeContext';
import { apiUrl, mediaUrl } from '@/config';

interface UserProfileData {
  id: string;
  username: string;
  bio: string;
  avatar_url: string;
  banner_url: string;
  website: string;
  twitter: string;
  instagram: string;
  discord: string;
  total_created: number;
  total_collected: number;
  total_volume: number;
  verified: boolean;
}

const UserProfile = () => {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const navigate = useNavigate();
  const { address } = useWallet();
  
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('collected');
  const [collectedNFTs, setCollectedNFTs] = useState<any[]>([]);
  const [createdNFTs, setCreatedNFTs] = useState<any[]>([]);
  const [likedNFTsList, setLikedNFTsList] = useState<any[]>([]);
  
  const { likedNFTs, syncLikes, isLiked } = useLikes();

  const isOwnProfile = address?.toLowerCase() === walletAddress?.toLowerCase();

  // Fetch profile data
  useEffect(() => {
    if (!walletAddress) return;
    
    const fetchProfile = async () => {
      try {
        setLoading(true);
        console.log(`[UserProfile] Fetching profile for wallet: ${walletAddress}`);
        const res = await fetch(apiUrl(`/profiles/${walletAddress}/`));
        console.log(`[UserProfile] Profile response status:`, res.status);
        const data = await res.json();
        console.log(`[UserProfile] Profile data:`, data);
        
        if (data.success) {
          setProfile(data.data);
        } else {
          console.error(`[UserProfile] Profile not found:`, data.error);
          toast.error('Profile not found');
          navigate('/');
        }
      } catch (error) {
        console.error('[UserProfile] Failed to fetch profile:', error);
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [walletAddress, navigate]);

  // Fetch followers/following counts
  const fetchSocialData = async () => {
    if (!walletAddress) return;
    try {
      const followersRes = await fetch(apiUrl(`/profiles/${walletAddress}/followers/`));
      const followersData = await followersRes.json();
      if (followersData.success) {
        setFollowersCount(followersData.count);
      }

      const followingRes = await fetch(apiUrl(`/profiles/${walletAddress}/following/`));
      const followingData = await followingRes.json();
      if (followingData.success) {
        setFollowingCount(followingData.count);
      }

      // Check if current user is following this profile
      if (address && address !== walletAddress) {
        const isFollowingRes = await fetch(apiUrl(`/profiles/${walletAddress}/followers/`));
        const isFollowingData = await isFollowingRes.json();
        if (isFollowingData.success) {
          const isFollowingUser = isFollowingData.followers.some(
            (follower: any) => follower.wallet_address.toLowerCase() === address.toLowerCase()
          );
          setIsFollowing(isFollowingUser);
        }
      }
    } catch (error) {
      console.error('Failed to fetch social data:', error);
    }
  };

  useEffect(() => {
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
            const collectedRes = await fetch(apiUrl(`/profiles/${walletAddress}/nfts/`));
            console.log(`[UserProfile] Collected NFTs response status:`, collectedRes.status);
            const collectedData = await collectedRes.json();
            console.log(`[UserProfile] Collected NFTs data:`, collectedData);
            if (collectedData.success) {
              console.log(`[UserProfile] Collected NFTs raw data:`, collectedData.data);
              // Map the data to match NFTCard props
              const mappedNFTs = (collectedData.data || []).map(mapNFTData);
              setCollectedNFTs(mappedNFTs);
            } else {
              console.error(`[UserProfile] Failed to fetch collected NFTs:`, collectedData.error);
            }
            break;
            
          case 'created':
            const createdRes = await fetch(apiUrl(`/profiles/${walletAddress}/created/`));
            console.log(`[UserProfile] Created NFTs response status:`, createdRes.status);
            const createdData = await createdRes.json();
            console.log(`[UserProfile] Created NFTs data:`, createdData);
            if (createdData.success) {
              console.log(`[UserProfile] Created NFTs raw data:`, createdData.data);
              // Map the data to match NFTCard props
              const mappedNFTs = (createdData.data || []).map(mapNFTData);
              setCreatedNFTs(mappedNFTs);
            } else {
              console.error(`[UserProfile] Failed to fetch created NFTs:`, createdData.error);
            }
            break;
            
          case 'liked':
            if (isOwnProfile) {
              const likedRes = await fetch(apiUrl(`/profiles/${walletAddress}/liked/`));
              console.log(`[UserProfile] Liked NFTs response status:`, likedRes.status);
              const likedData = await likedRes.json();
              console.log(`[UserProfile] Liked NFTs data:`, likedData);
              if (likedData.success) {
                console.log(`[UserProfile] Liked NFTs raw data:`, likedData.data);
                // Map the data to match NFTCard props
                const mappedNFTs = (likedData.data || []).map(mapNFTData);
                setLikedNFTsList(mappedNFTs);
              } else {
                console.error(`[UserProfile] Failed to fetch liked NFTs:`, likedData.error);
              }
            }
            break;
        }
      } catch (error) {
        console.error(`[UserProfile] Failed to fetch ${activeTab} data:`, error);
      }
    };

    fetchNFTs();
  }, [walletAddress, activeTab, isOwnProfile]);

  const handleFollowToggle = async () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (isOwnProfile) {
      toast.error('You cannot follow yourself');
      return;
    }

    try {
      const endpoint = isFollowing ? 'unfollow' : 'follow';
      const res = await fetch(apiUrl(`/profiles/${walletAddress}/${endpoint}/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_address: address })
      });
      
      const data = await res.json();
      if (data.success) {
        setIsFollowing(!isFollowing);
        setFollowersCount(data.followers_count);
        
        // Show success message with activity info
        const action = isFollowing ? 'Unfollowed' : 'Followed';
        toast.success(`${action} ${profile?.username || 'User'}!`);
        
        // Refresh social data to get updated counts
        fetchSocialData();
      } else {
        toast.error(data.error || 'Failed to update follow status');
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
      toast.error('Failed to update follow status');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const shareProfile = () => {
    const url = `${window.location.origin}/profile/${walletAddress}`;
    if (navigator.share) {
      navigator.share({
        title: `${profile?.username || 'User'}'s Profile`,
        url: url
      });
    } else {
      copyToClipboard(url);
    }
  };

  const getProfileImageUrl = (profile: UserProfileData | null) => {
    return mediaUrl(profile?.avatar_url || '');
  };

  const getProfileDisplayName = (profile: UserProfileData | null, address: string) => {
    return profile?.username || address?.slice(0, 6) + '...' + address?.slice(-4) || 'Unknown';
  };

  // Helper function to map NFT data to NFTCard props
  const mapNFTData = (nft: any) => {
    const mappedNFT = {
      ...nft,
      image: nft.image_url, // Map image_url to image
      title: nft.name, // Map name to title
      price: nft.price?.toString() || '0', // Ensure price is string
      collection: nft.collection || 'Unknown Collection',
      tokenId: nft.token_id,
      owner_address: nft.owner_address,
      is_listed: nft.is_listed,
      id: `local_${nft.id}`, // Format ID for NFTDetails navigation
      liked: isLiked(nft.id) || nft.liked || false,
    };
    console.log(`[UserProfile] Mapped NFT:`, { originalId: nft.id, mappedId: mappedNFT.id, title: mappedNFT.title });
    return mappedNFT;
  };

  // Handle like toggle for NFTs in this page
  const handleLikeToggle = async (nftId: string | number, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      const result = await nftService.toggleNFTLike(nftId, address);
      if (result.success) {
        const actualLiked = result.liked !== undefined ? result.liked : newLikedState;
        const updater = (list: any[]) => list.map((n) => (n.id === nftId ? { ...n, liked: actualLiked } : n));
        setCollectedNFTs(updater);
        setCreatedNFTs(updater);
        setLikedNFTsList(updater);
        await syncLikes();
        toast.success(actualLiked ? 'Added to favorites' : 'Removed from favorites');
      } else {
        toast.error(result.error || 'Failed to update like status');
      }
    } catch (e) {
      console.error('Failed to toggle like:', e);
      toast.error('Failed to update like status');
    }
  };

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
          src={profile.banner_url || getProfileImageUrl(profile)} 
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
                <Avatar className="h-24 w-24 mx-auto mb-4">
                  <AvatarImage src={getProfileImageUrl(profile)} />
                  <AvatarFallback className="text-2xl">
                    {getProfileDisplayName(profile, walletAddress!).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold">{getProfileDisplayName(profile, walletAddress!)}</h1>
                  {profile.verified && (
                    <Badge variant="success" className="text-xs">Verified</Badge>
                  )}
                </div>
                
                <p className="text-muted-foreground mb-4">{walletAddress}</p>
                
                {profile.bio && (
                  <p className="text-sm text-muted-foreground mb-4">{profile.bio}</p>
                )}

                {/* Social Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-lg font-semibold">{collectedNFTs.length}</div>
                    <div className="text-xs text-muted-foreground">Collected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold">{createdNFTs.length}</div>
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
                      Copy Address
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
                          liked={isLiked(nft.id) || nft.liked}
                          onLike={(newLiked) => handleLikeToggle(nft.id, newLiked)}
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
                          liked={isLiked(nft.id) || nft.liked}
                          onLike={(newLiked) => handleLikeToggle(nft.id, newLiked)}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                {isOwnProfile && (
                  <TabsContent value="liked" className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {likedNFTsList.length === 0 ? (
                        <div className="col-span-full text-center text-muted-foreground py-8">
                          No liked NFTs yet.
                        </div>
                      ) : (
                        likedNFTsList.map((nft: any) => (
                          <NFTCard 
                            key={nft.id} 
                            {...nft} 
                            liked={isLiked(nft.id)}
                            onLike={(newLiked) => handleLikeToggle(nft.id, newLiked)}
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