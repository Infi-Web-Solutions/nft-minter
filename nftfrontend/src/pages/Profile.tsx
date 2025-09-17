import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Edit, Share, MoreHorizontal, Copy, ExternalLink, Camera, Settings } from 'lucide-react';
import NFTCard from '@/components/NFTCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import WalletGuard from '@/components/WalletGuard';
import { useWallet } from '@/contexts/WalletContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { nftService } from '@/services/nftService';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';
import { apiUrl } from '@/config';

const Profile = () => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { address } = useWallet();
  const profileImageRef = useRef<HTMLInputElement>(null);
  const coverImageRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    id:'',
    username: '',
    bio: '',
    avatar_url: '',
    banner_url: '',
    website: '',
    twitter: '',
    instagram: '',
    discord: '',
    total_created: 0,
    total_collected: 0,
    total_volume: 0
  });

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [ownedNFTs, setOwnedNFTs] = useState([]);
  const [favoriteNFTs, setFavoriteNFTs] = useState([]);
  const [activity, setActivity] = useState([]);
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();

  const [selectedTab, setSelectedTab] = useState('collected');
  const [createdNFTs, setCreatedNFTs] = useState([]);
  const [combinedNFTs, setCombinedNFTs] = useState([]);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);

  // Fetch followers/following counts
  useEffect(() => {
    if (!address) return;
    const fetchFollowers = async () => {
      try {
        const res = await fetch(apiUrl(`/profiles/${address}/followers/`));
        const data = await res.json();
        if (data.success) {
          setFollowersCount(data.count);
          setFollowers(data.followers);
        }
      } catch (e) { /* ignore */ }
    };
    const fetchFollowing = async () => {
      try {
        const res = await fetch(apiUrl(`/profiles/${address}/following/`));
        const data = await res.json();
        if (data.success) {
          setFollowingCount(data.count);
          setFollowing(data.following);
        }
      } catch (e) { /* ignore */ }
    };
    fetchFollowers();
    fetchFollowing();
  }, [address]);

  // Follow/unfollow logic
  const handleFollow = async (targetAddress: string) => {
    try {
      const res = await fetch(apiUrl(`/profiles/${targetAddress}/follow/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_address: address })
      });
      const data = await res.json();
      if (data.success) {
        setIsFollowing(true);
        setFollowersCount(data.followers_count);
        toast.success('Followed!');
      } else {
        toast.error(data.error || 'Failed to follow');
      }
    } catch (e) {
      toast.error('Failed to follow');
    }
  };
  const handleUnfollow = async (targetAddress: string) => {
    try {
      const res = await fetch(apiUrl(`/profiles/${targetAddress}/unfollow/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_address: address })
      });
      const data = await res.json();
      if (data.success) {
        setIsFollowing(false);
        setFollowersCount(data.followers_count);
        toast.success('Unfollowed!');
      } else {
        toast.error(data.error || 'Failed to unfollow');
      }
    } catch (e) {
      toast.error('Failed to unfollow');
    }
  };

  // Stats
  const items = createdNFTs.length;
  // Collections = unique NFTs where owner or creator is user
  const collections = useMemo(() => {
    const all = [...createdNFTs, ...ownedNFTs];
    const unique = Array.from(new Map(all.map(nft => [nft.id, nft])).values());
    return unique.length;
  }, [createdNFTs, ownedNFTs]);

  const userStats = {
    followers: followersCount,
    following: followingCount,
    collections,
    items
  };

          // Fetch combined NFTs (local only)
  useEffect(() => {
    const fetchCombinedNFTs = async () => {
      if (!address) return;
      
      setIsLoadingNFTs(true);
      console.log('[Profile] Starting to fetch combined NFTs...');
      try {
        const nfts = await nftService.getCombinedNFTs(address);
        console.log('[Profile] Setting combinedNFTs with length:', nfts.length);
        console.log('[Profile] First NFT sample:', nfts[0]);
        setCombinedNFTs(nfts);
        console.log('[Profile] First few NFTs:', nfts.slice(0, 3));
      } catch (error) {
        console.error('Error fetching combined NFTs:', error);
        toast.error('Failed to load NFTs');
      } finally {
        setIsLoadingNFTs(false);
      }
    };

    fetchCombinedNFTs();
  }, [address]);

  // Debug: Log whenever combinedNFTs changes
  useEffect(() => {
    console.log('[Profile] combinedNFTs state changed:', combinedNFTs.length);
  }, [combinedNFTs]);

  useEffect(() => {
    if (favoriteNFTs.length > 0) {
      console.log('[Profile] Liked NFT IDs:', favoriteNFTs.map((nft: any) => nft.id));
    }
    if (combinedNFTs.length > 0) {
      console.log('[Profile] Displayed NFT IDs:', combinedNFTs.map((nft: any) => nft.id));
    }
  }, [favoriteNFTs, combinedNFTs]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Handle image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'cover') => {
    const file = event.target.files?.[0];
    if (!file || !address) return;

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        // Update local state immediately for preview
        setProfile(prev => ({
          ...prev,
          [type === 'profile' ? 'avatar_url' : 'banner_url']: base64String
        }));

        // Save to backend
        const response = await fetch(apiUrl(`/profiles/${address}/update/`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            [type === 'profile' ? 'profile_image' : 'cover_image']: base64String
          })
        });
        
        const data = await response.json();
        if (data.success) {
          setProfile(prev => ({
            ...prev,
            ...data.data
          }));
          toast.success(`${type === 'profile' ? 'Profile' : 'Cover'} image updated successfully`);
        } else {
          toast.error(data.error || 'Failed to update image');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    }
  };

  // Update profile
  const updateProfile = async (data: any) => {
    if (!address) return;

    try {
      const response = await fetch(apiUrl(`/profiles/${address}/update/`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      if (result.success) {
        setProfile(prev => ({
          ...prev,
          ...result.data
        }));
        toast.success('Profile updated successfully');
      } else {
        toast.error(result.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!address) return;
      
      try {
        const response = await fetch(apiUrl(`/profiles/${address}/`));
        const data = await response.json();
        if (data.success) {
          setProfile(prev => ({
            ...prev,
            ...data.data
          }));
        } else {
          toast.error(data.error || 'Failed to load profile');
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    };

    fetchProfile();
  }, [address]);

  // Fetch created NFTs
  useEffect(() => {
    if (!address) return;
    const fetchCreatedNFTs = async () => {
      try {
        const res = await fetch(apiUrl(`/profiles/${address}/created/`));
        const data = await res.json();
        if (data.success) setCreatedNFTs(data.data);
      } catch (e) { /* ignore */ }
    };
    fetchCreatedNFTs();
  }, [address]);

  // Fetch owned NFTs
  useEffect(() => {
    if (!address) return;
    const fetchOwnedNFTs = async () => {
      try {
        const res = await fetch(apiUrl(`/profiles/${address}/nfts/`));
        const data = await res.json();
        if (data.success) setOwnedNFTs(data.data);
      } catch (e) { /* ignore */ }
    };
    fetchOwnedNFTs();
  }, [address]);

  // Fetch activity
  useEffect(() => {
    if (!address) return;
    const fetchActivity = async () => {
      try {
        const res = await fetch(apiUrl(`/activities/?user=${address}`));
        const data = await res.json();
        if (data.success) setActivity(data.data);
      } catch (e) { /* ignore */ }
    };
    fetchActivity();
  }, [address]);

  // Helper to check if NFT is liked
  const isNFTLiked = (nft: any) => likedNFTIds.has(String(nft.id));
  // Helper to update favoriteNFTs after like/unlike
  const handleLikeToggle = async (nft: any, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    try {
      // Pass the full NFT ID to the API call
      const result = await nftService.toggleNFTLike(nft.id, address);
      if (result.success) {
        // Use the actual liked state from the backend
        const actualLikedState = result.liked !== undefined ? result.liked : newLikedState;
        // Update the combined NFTs state immediately
        setCombinedNFTs(prevNfts => 
          prevNfts.map(n => 
            n.id === nft.id 
              ? { ...n, liked: actualLikedState }
              : n
          )
        );
        // Always refresh favoriteNFTs from backend for accuracy
        await refreshLikedNFTs();
        toast.success(actualLikedState ? 'Added to favorites' : 'Removed from favorites');
      } else {
        toast.error(result.error || 'Failed to update like status');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update like status');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <WalletGuard message="Connect your wallet to view and manage your profile">
        {/* Profile Header */}
        <div className="relative">
          <div 
            className="h-64 bg-gradient-to-r from-purple-500 to-blue-600 relative group"
            style={profile.banner_url ? { backgroundImage: `url(${profile.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-4 right-4 bg-white/50 hover:bg-white/75 z-10"
                onClick={() => coverImageRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <input
              type="file"
              ref={coverImageRef}
              className="hidden"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, 'cover')}
            />
          </div>
          <div className="container mx-auto px-4">
            <div className="relative -mt-16 pb-8">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="relative">
                  <Avatar className="h-32 w-32 border-4 border-background">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>
                      {address ? address.slice(2, 4).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-0 right-0 bg-white/50 hover:bg-white/75"
                    onClick={() => profileImageRef.current?.click()}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <input
                    type="file"
                    ref={profileImageRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'profile')}
                  />
                </div>
                
                <div className="flex-1">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div>
                      <h1 className="text-3xl font-bold mb-2">
                        {address ? formatAddress(address) : 'Anonymous User'}
                      </h1>
                      <p className="text-muted-foreground mb-4">Digital artist and NFT creator passionate about blockchain technology</p>
                      
                      <div className="flex gap-6 text-sm">
                        <div><span className="font-semibold">{userStats.items}</span> items</div>
                        <div><span className="font-semibold">{userStats.collections}</span> collections</div>
                        <div><span className="font-semibold">{userStats.followers}</span> followers</div>
                        <div><span className="font-semibold">{userStats.following}</span> following</div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </Button>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Profile
                      </Button>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="container mx-auto px-4 py-8">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full mt-8">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="collected">Collected</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="favorite">Favorite</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            {/* Collected Tab: unique NFTs from created + owned */}
            <TabsContent value="collected" className="mt-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {collections === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground">No collected NFTs yet.</div>
                ) : (
                  Array.from(new Map([...createdNFTs, ...ownedNFTs].map(nft => [nft.id, nft])).values()).map((nft: any) => {
                    // Convert numeric ID to local_ format for consistency
                    const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                    console.log('[Profile] Rendering NFT in collected tab:', {
                      original_id: nft.id,
                      converted_id: nftId,
                      id_type: typeof nftId,
                      title: nft.name,
                      image: nft.image_url,
                      source: 'local',
                      token_id: nft.token_id,
                      liked: isNFTLiked({ ...nft, id: nftId })
                    });
                    return (
                      <NFTCard
                        key={nftId}
                        {...nft}
                        image={nft.image_url}
                        tokenId={nft.token_id}
                        id={nftId}
                        price={nft.price ? nft.price.toString() : '0'}
                        title={nft.name}
                        collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                        owner_address={nft.owner_address}
                        is_listed={nft.is_listed}
                        liked={isNFTLiked({ ...nft, id: nftId })}
                        onLike={(newLikedState) => handleLikeToggle({ ...nft, id: nftId }, newLikedState)}
                        canLike={true}
                        source="local"
                      />
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* Items Tab: created NFTs only */}
            <TabsContent value="items" className="mt-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {createdNFTs.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground">No created NFTs yet.</div>
                ) : (
                  createdNFTs.map((nft: any) => {
                    // Convert numeric ID to local_ format for consistency
                    const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                    return (
                      <NFTCard
                        key={nftId}
                        {...nft}
                        image={nft.image_url}
                        tokenId={nft.token_id}
                        id={nftId}
                        price={nft.price ? nft.price.toString() : '0'}
                        title={nft.name}
                        collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                        owner_address={nft.owner_address}
                        is_listed={nft.is_listed}
                        liked={isNFTLiked({ ...nft, id: nftId })}
                        onLike={(newLikedState) => handleLikeToggle({ ...nft, id: nftId }, newLikedState)}
                        canLike={true}
                        source="local"
                      />
                    );
                  })
                )}
              </div>
            </TabsContent>

            {/* Favorite Tab: liked NFTs only */}
            <TabsContent value="favorite" className="mt-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">My Favorite NFTs</h3>
                {Array.from(likedNFTIds).length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={() => window.location.href = '/favorites'}
                    className="flex items-center gap-2"
                  >
                    ❤️ View All Favorites ({Array.from(likedNFTIds).length})
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from(likedNFTIds).length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground">
                    <div className="text-4xl mb-4">❤️</div>
                    <p className="mb-4">No favorite NFTs yet.</p>
                    <Button 
                      variant="outline" 
                      onClick={() => window.location.href = '/marketplace'}
                    >
                      Explore NFTs
                    </Button>
                  </div>
                ) : (
                  // Filter combinedNFTs to show only liked NFTs
                  combinedNFTs
                    .filter((nft: any) => likedNFTIds.has(String(nft.id)))
                    .map((nft: any) => (
                      <NFTCard
                        key={nft.id}
                        {...nft}
                        image={nft.image_url}
                        tokenId={nft.token_id}
                        id={nft.id}
                        price={nft.price ? nft.price.toString() : '0'}
                        title={nft.name}
                        collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                        owner_address={nft.owner_address}
                        is_listed={nft.is_listed}
                        liked={true}
                        onLike={(newLikedState) => handleLikeToggle(nft, newLikedState)}
                        canLike={true}
                        source="local"
                      />
                    ))
                )}
              </div>
            </TabsContent>

            {/* Activity Tab: user actions */}
            <TabsContent value="activity" className="mt-8">
              <div className="space-y-4">
                {activity.length === 0 ? (
                  <div className="text-center text-muted-foreground">No activity yet.</div>
                ) : (
                  activity.map((act: any, i: number) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={act.avatar_url || ''} />
                            <AvatarFallback>U</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm">
                              {act.description || `${act.type} - ${act.nft_name || ''}`}
                            </p>
                            <p className="text-xs text-muted-foreground">{act.timestamp ? new Date(act.timestamp).toLocaleString() : ''}</p>
                          </div>
                          <Badge variant="secondary">{act.type}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </WalletGuard>

      <Footer />
    </div>
  );
};

export default Profile;
