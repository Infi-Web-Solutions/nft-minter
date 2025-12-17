import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Edit, Share, MoreHorizontal, Copy, ExternalLink, Camera, Settings, BadgeCheck, Loader2 } from 'lucide-react';
import NFTCard from '@/components/NFTCard';
import { collateralLendingService } from '@/services/collateralLendingService';
import { wrappedLeasingApiService } from '@/services/wrappedLeasingApiService';
import CollateralLeasingSidebar from '@/components/CollateralLeasingSidebar';
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
import { getNFTMarketplaceAddress } from '@/services/configService';

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
  const [lendedNFTs, setLendedNFTs] = useState([]);
  const [rentedNFTs, setRentedNFTs] = useState<any[]>([]);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [myRentedOut, setMyRentedOut] = useState<any[]>([]);
  const [myRentals, setMyRentals] = useState<any[]>([]);
  const [myWrappedRentals, setMyWrappedRentals] = useState<any[]>([]);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [isLoadingRentals, setIsLoadingRentals] = useState(false);
  const [activeLoans, setActiveLoans] = useState<Map<string, { status: string, borrower: string, loanId: string }>>(new Map());
  const [showCollateralSidebar, setShowCollateralSidebar] = useState(false);
  const [selectedLoanNft, setSelectedLoanNft] = useState<{contract: string, tokenId: string, loanId?: string, leasingType?: 'collateral' | 'wrapped' | 'marketplace'} | null>(null);
  const [contractAddress, setContractAddress] = useState<string>('');
  const [activeListings, setActiveListings] = useState<Map<string, { listingId: number, status: string }>>(new Map<string, { listingId: number, status: string }>());

  // Load contract address from config
  useEffect(() => {
    getNFTMarketplaceAddress().then(setContractAddress).catch(console.error);
  }, []);

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
    
    const fetchActiveLoans = async () => {
        try {
            const res = await fetch(apiUrl('/loans/open'));
            const data = await res.json();
            if (data.success) {
                const loanMap = new Map<string, { status: string, borrower: string, loanId: string, lender: string }>();
                const myLended: any[] = [];

                await Promise.all(data.data.map(async (loan: any) => {
                    const key = `${loan.nftContract.toLowerCase()}-${loan.tokenId}`;
                    loanMap.set(key, { status: loan.status, borrower: loan.borrower, loanId: loan.loanId, lender: loan.lender });
                    
                    // If current user is the lender, fetch NFT details
                    if (address && loan.lender && loan.lender.toLowerCase() === address.toLowerCase()) {
                         try {
                             // Try to fetch from backend first
                             let nftData = null;
                             const nftRes = await fetch(apiUrl(`/nfts/external/${loan.nftContract}/${loan.tokenId}`));
                             const nftResData = await nftRes.json();
                             if (nftResData.success) {
                                 nftData = nftResData.data;
                             }
                             
                             if (nftData) {
                                 myLended.push({
                                     ...nftData,
                                     loanId: loan.loanId,
                                     loanStatus: loan.status,
                                     loanBorrower: loan.borrower,
                                     loanLender: loan.lender
                                 });
                             }
                         } catch (e) {
                             console.error('Failed to fetch lended NFT details', e);
                         }
                    }
                }));
                
                setActiveLoans(loanMap);
                setLendedNFTs(myLended);
            }
        } catch (err) {
            console.error('Failed to fetch active loans', err);
        }
    };

    fetchFollowers();
    fetchFollowing();
    fetchActiveLoans();
  }, [address]);

  // Fetch active marketplace listings
  useEffect(() => {
    const fetchListings = async () => {
        try {
            // First try to get listings from backend API
            const res = await fetch(apiUrl('/listings/active'));
            const data = await res.json();
            
            if (data.success && data.data) {
                const listingMap = new Map<string, { listingId: number, status: string }>();
                data.data.forEach((l: any) => {
                    const key = `${l.nftAddress.toLowerCase()}-${String(l.tokenId)}`;
                    listingMap.set(key, { listingId: l.listingId, status: l.status });
                });
                setActiveListings(listingMap);
            }
        } catch (err) {
            console.error('Failed to fetch active listings', err);
        }
    };
    fetchListings();
  }, []);

  // Fetch all NFTs
  useEffect(() => {
    if (!address) return;
    const fetchNFTs = async () => {
      setIsLoadingNFTs(true);
      try {
        const nfts = await nftService.getCombinedNFTs(address);
        
        // Filter for Created tab
        const created = nfts.filter((nft: any) => 
            nft.creator_address && nft.creator_address.toLowerCase() === address.toLowerCase()
        );
        setCreatedNFTs(created);
        const owned = nfts.filter((nft: any) => {
            const isOwner = nft.owner_address && nft.owner_address.toLowerCase() === address.toLowerCase();
            const isRentable = nft.isRentable || activeListings.has(`${(nft.contract_address || nft.collection).toLowerCase()}-${nft.token_id}`);
            return isOwner && !isRentable;
        });
        setOwnedNFTs(owned);
        
        // Combined for other uses if needed, but we rely on specific state for tabs
        setCombinedNFTs(nfts);

        // Favorites
        const favorites = nfts.filter((nft: any) => likedNFTIds.has(String(nft.id)));
        setFavoriteNFTs(favorites);

      } catch (error) {
        console.error('Error fetching NFTs:', error);
        toast.error('Failed to load NFTs');
      } finally {
        setIsLoadingNFTs(false);
      }
    };

    fetchNFTs();
  }, [address, likedNFTIds, activeListings]);

  // Fetch wrapped NFTs
  useEffect(() => {
    if (!address) return;
    const fetchWrappedNFTs = async () => {
      try {
        const [wrapped, contractInfo] = await Promise.all([
            wrappedLeasingApiService.getUserWrappedNFTs(address),
            wrappedLeasingApiService.getContractInfo()
        ]);
        
        const enrichedWrapped = await Promise.all(wrapped.map(async (w: any) => {
             try {
                 // Fetch metadata for the original NFT
                 const res = await fetch(apiUrl(`/nfts/external/${w.originalNft}/${w.originalTokenId}`));
                 const data = await res.json();
                 if (data.success) {
                     return {
                         ...w,
                         ...data.data, // This should have name, image, description, attributes
                         id: `wrapped_${w.wId}`, // Unique ID for React key
                         collection: data.data.collection || 'Wrapped NFT',
                         isWrapped: true,
                         wrappedContractAddress: contractInfo.wrappedLeasingAddress
                     };
                 }
             } catch (e) {
                 console.error('Failed to fetch metadata for wrapped NFT', w.wId, e);
             }
             return {
                 ...w,
                 id: `wrapped_${w.wId}`,
                 name: `Wrapped NFT #${w.wId}`,
                 collection: 'Wrapped Collection',
                 isWrapped: true,
                 wrappedContractAddress: contractInfo.wrappedLeasingAddress
             };
        }));
        
        setMyWrappedRentals(enrichedWrapped);
      } catch (e) {
        console.error('Failed to fetch wrapped NFTs', e);
      }
    };
    fetchWrappedNFTs();
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
        setFollowingCount(data.following_count);
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
        setFollowingCount(data.following_count);
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

  // Merge owned and created NFTs for Combined/Collected view
  useEffect(() => {
    const uniqueNFTs = new Map();
    
    // Add owned NFTs first
    ownedNFTs.forEach((nft: any) => {
      uniqueNFTs.set(nft.id, nft);
    });
    
    // Add created NFTs (if not already present)
    // This ensures created NFTs are shown in "Collected" tab
    createdNFTs.forEach((nft: any) => {
      if (!uniqueNFTs.has(nft.id)) {
        uniqueNFTs.set(nft.id, nft);
      }
    });
    
    setCombinedNFTs(Array.from(uniqueNFTs.values()));
  }, [ownedNFTs, createdNFTs]);

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
        <div className="relative mb-8">
          <div 
            className="h-48 md:h-80 w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 relative group overflow-hidden"
            style={profile.banner_url ? { backgroundImage: `url(${profile.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white border-0 backdrop-blur-md"
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
            <div className="relative -mt-20 md:-mt-24 pb-4">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="relative group">
                  <Avatar className="h-32 w-32 md:h-48 md:w-48 border-4 border-background shadow-2xl rounded-2xl">
                    <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="text-4xl bg-gradient-to-br from-gray-100 to-gray-300 text-gray-600">
                      {address ? address.slice(2, 4).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white border-0 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
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
                
                <div className="flex-1 pt-2 md:pt-24 w-full">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-2">
                        {address ? formatAddress(address) : 'Anonymous User'}
                        <BadgeCheck className="h-6 w-6 text-blue-400 fill-blue-400/10" />
                      </h1>
                      <p className="text-muted-foreground mb-6 max-w-2xl text-lg">
                        {profile.bio || "Digital artist and NFT creator passionate about blockchain technology."}
                      </p>
                      
                      <div className="flex flex-wrap gap-6 text-sm mb-4">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{userStats.items}</span> 
                            <span className="text-muted-foreground">Items</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{userStats.collections}</span>
                            <span className="text-muted-foreground">Collections</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{userStats.followers}</span>
                            <span className="text-muted-foreground">Followers</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{userStats.following}</span>
                            <span className="text-muted-foreground">Following</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 w-full md:w-auto">
                      <Button variant="outline" className="flex-1 md:flex-none gap-2">
                        <Copy className="h-4 w-4" />
                        <span className="hidden md:inline">Copy Address</span>
                      </Button>
                      <Button variant="outline" className="flex-1 md:flex-none gap-2">
                        <Settings className="h-4 w-4" />
                        <span className="hidden md:inline">Edit Profile</span>
                      </Button>
                      <Button variant="outline" size="icon">
                        <Share className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon">
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
        <div className="container mx-auto px-4 py-4">
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <div className="border-b border-border/50 mb-8 overflow-x-auto">
                <TabsList className="w-full justify-start bg-transparent p-0 h-auto space-x-2 md:space-x-6" style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                      
                    }}>
                    {[
                        { id: 'collected', label: 'Collected', icon: '' },
                        { id: 'items', label: 'Created', icon: '' },
                        { id: 'favorite', label: 'Favorites', icon: '' },
                        { id: 'rentals', label: 'Rentals', icon: '' },
                        { id: 'lend', label: 'Lend', icon: '' },
                        { id: 'followers', label: 'Followers', icon: '' },
                        { id: 'activity', label: 'Activity', icon: '' },
                    ].map(tab => (
                        <TabsTrigger 
                            key={tab.id}
                            value={tab.id}
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 md:px-4 py-3 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none transition-all hover:text-foreground text-base"
                        >
                            <span className="mr-2">{tab.icon}</span>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>

            {/* Collected Tab: combined NFTs */}
            <TabsContent value="collected" className="mt-8">
              {isLoadingNFTs ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {combinedNFTs.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground">No collected NFTs yet.</div>
                ) : (
                  combinedNFTs.map((nft: any) => {
                    // Convert numeric ID to local_ format for consistency
                    const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                    
                    // Determine loan status
                    let contractAddr = nft.contract_address || '';
                    if (!contractAddr) {
                        if (nft.source === 'local' || !nft.source) {
                            contractAddr = contractAddress;
                        } else if (typeof nft.collection === 'string' && nft.collection.startsWith('0x')) {
                            contractAddr = nft.collection;
                        }
                    }
                    
                    const loanKey = contractAddr ? `${contractAddr.toLowerCase()}-${nft.token_id}` : '';
                    const loanInfo = loanKey ? activeLoans.get(loanKey) : undefined;
                    const listingInfo = activeListings.get(loanKey);
                    const isRentable = !!listingInfo;
                    const isRented = listingInfo?.status === 'Rented';

                    console.log('[Profile] Rendering NFT in collected tab:', {
                      original_id: nft.id,
                      converted_id: nftId,
                      id_type: typeof nftId,
                      title: nft.name,
                      image: nft.image_url,
                      collection: nft.collection,
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
                        isRentable={isRentable}
                        isRented={isRented}
                        onClick={() => {
                          window.location.href = `/nft/${nftId}`;
                        }}
                        loanStatus={loanInfo?.status}
                        loanBorrower={loanInfo?.borrower}
                        loanId={loanInfo?.loanId}
                        onRequestLoan={() => {
                            setSelectedLoanNft({
                                contract: contractAddr,
                                tokenId: String(nft.token_id),
                                loanId: loanInfo?.loanId
                            });
                            setShowCollateralSidebar(true);
                        }}
                      />
                    );
                  })
                )}
              </div>
              )}
            </TabsContent>

            {/* Items Tab: created NFTs only */}
            <TabsContent value="items" className="mt-8">
              {isLoadingNFTs ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {createdNFTs.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground">No created NFTs yet.</div>
                ) : (
                  createdNFTs.map((nft: any) => {
                    // Convert numeric ID to local_ format for consistency
                    const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                    
                    // Determine loan status
                    let contractAddr = nft.contract_address || '';
                    if (!contractAddr) {
                        if (nft.source === 'local' || !nft.source) {
                            contractAddr = contractAddress;
                        } else if (typeof nft.collection === 'string' && nft.collection.startsWith('0x')) {
                            contractAddr = nft.collection;
                        }
                    }
                    
                    const loanKey = contractAddr ? `${contractAddr.toLowerCase()}-${nft.token_id}` : '';
                    const loanInfo = loanKey ? activeLoans.get(loanKey) : undefined;
                    const listingInfo = activeListings.get(loanKey);
                    const isRentable = !!listingInfo;
                    const isRented = listingInfo?.status === 'Rented';

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
                        isRentable={isRentable}
                        isRented={isRented}
                        onClick={() => {
                          window.location.href = `/nft/${nftId}`;
                        }}
                        loanStatus={loanInfo?.status}
                        loanBorrower={loanInfo?.borrower}
                        loanId={loanInfo?.loanId}
                        onRequestLoan={() => {
                            setSelectedLoanNft({
                                contract: contractAddr,
                                tokenId: String(nft.token_id),
                                loanId: loanInfo?.loanId
                            });
                            setShowCollateralSidebar(true);
                        }}
                      />
                    );
                  })
                )}
              </div>
              )}
            </TabsContent>

            {/* Favorite Tab: liked NFTs only */}
            <TabsContent value="favorite" className="mt-8" style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                      
                    }}> 
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">My Favorite NFTs</h3>
                {Array.from(likedNFTIds).length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={() => window.location.href = '/favorites'}
                    
                    className="flex items-center gap-2"
                  >
                  View All Favorites ({Array.from(likedNFTIds).length})
                  </Button>
                )}
              </div>
              {isLoadingNFTs ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
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
                    .map((nft: any) => {
                      const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                      
                      let contractAddr = nft.contract_address || '';
                      if (!contractAddr) {
                          if (nft.source === 'local' || !nft.source) {
                              contractAddr = contractAddress;
                          } else if (typeof nft.collection === 'string' && nft.collection.startsWith('0x')) {
                              contractAddr = nft.collection;
                          }
                      }
                      
                      const loanKey = contractAddr ? `${contractAddr.toLowerCase()}-${nft.token_id}` : '';
                      const listingInfo = activeListings.get(loanKey);
                      const isRentable = !!listingInfo;
                      const isRented = listingInfo?.status === 'Rented';

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
                          liked={true}
                          onLike={(newLikedState) => handleLikeToggle(nft, newLikedState)}
                          canLike={true}
                          source="local"
                          isRentable={isRentable}
                          isRented={isRented}
                          onClick={() => {
                            window.location.href = `/nft/${nftId}`;
                          }}
                          onRequestLoan={() => {
                              setSelectedLoanNft({
                                  contract: contractAddr, // Note: contractAddr needs to be defined in this scope
                                  tokenId: String(nft.token_id)
                              });
                              setShowCollateralSidebar(true);
                          }}
                        />
                      );
                    })
                )}
              </div>
              )}
            </TabsContent>

            {/* Followers Tab: user followers */}
            <TabsContent value="followers" className="mt-8">
              <div className="space-y-4">
                {followers.length === 0 ? (
                  <div className="text-center text-muted-foreground">No followers yet.</div>
                ) : (
                  followers.map((follower: any, i: number) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={follower.avatar_url || ''} />
                            <AvatarFallback>{follower.username ? follower.username.slice(0, 2).toUpperCase() : 'U'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{follower.username || 'Anonymous'}</p>
                            <p className="text-xs text-muted-foreground">{follower.wallet_address}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Rentals Tab */}
            {/* Rentals Tab */}
            {/* Rentals Tab */}
            <TabsContent value="rentals" className="mt-8">
                {isLoadingRentals ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                <div className="space-y-8">
                    {/* My Listings Section */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">My Listings (For Rent)</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {myListings.length === 0 ? (
                                <div className="col-span-full text-center text-muted-foreground py-8 bg-muted/20 rounded-lg">
                                    <p>You have no NFTs listed for rent.</p>
                                </div>
                            ) : (
                                myListings.map((nft: any) => (
                                    <div key={nft.id} className="relative group">
                                        <NFTCard
                                            {...nft}
                                            image={nft.image_url}
                                            tokenId={nft.tokenId}
                                            id={nft.id}
                                            price={nft.pricePerSecond ? (Number(nft.pricePerSecond) * 86400 / 1e18).toFixed(4) : '0'} // Show daily price
                                            title={nft.name}
                                            collection={nft.collection || 'Unknown Collection'}
                                            owner_address={address}
                                            is_listed={true}
                                            liked={false}
                                            canLike={false}
                                            source="local"
                                            isRentable={true}
                                            onClick={() => {
                                                // window.location.href = `/nft/${nft.id}`;
                                            }}
                                            onRequestLoan={() => {
                                                setSelectedLoanNft({
                                                    contract: nft.nftAddress,
                                                    tokenId: String(nft.tokenId),
                                                    leasingType: 'marketplace' // Or whatever type triggers the right sidebar
                                                });
                                                setShowCollateralSidebar(true);
                                            }}
                                            onRent={() => {
                                                console.log("Manage Listing clicked for:", nft);
                                                setSelectedLoanNft({
                                                    contract: nft.nftAddress,
                                                    tokenId: String(nft.tokenId),
                                                    loanId: String(nft.listingId),
                                                    leasingType: 'marketplace'
                                                });
                                                setShowCollateralSidebar(true);
                                            }}
                                        />
                                        <div className="absolute top-3 right-3 bg-blue-600/90 backdrop-blur-md text-white text-xs px-2 py-1 rounded-md font-medium border border-white/10 z-10 flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                                            Request for Rent
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                 
                </div>
                )}
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

            {/* Lending Tab: NFTs user is lending */}
            <TabsContent value="lend" className="mt-8">
              <div className="space-y-8">
                {/* Wrapped NFTs Section */}
                <div>
                  <h3 className="text-xl font-bold mb-4">My Rented NFTs (Available for Sub-lease)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {myWrappedRentals.length === 0 ? (
                      <div className="col-span-full text-center text-muted-foreground py-8 bg-muted/20 rounded-lg">
                        <div className="text-4xl mb-4">🎁</div>
                        <p className="mb-4">You don't have any active wrapped rentals.</p>
                      </div>
                    ) : (
                      myWrappedRentals.map((nft: any) => {
                        const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                        return (
                          <NFTCard
                            key={nftId}
                            {...nft}
                            image={nft.image_url}
                            tokenId={nft.tokenId}
                            id={nftId}
                            price={null}
                            title={nft.name}
                            collection={nft.collection || 'Wrapped NFT'}
                            owner_address={address}
                            is_listed={false}
                            liked={false}
                            canLike={false}
                            source="rented"
                            isWrapped={true}
                            onSubLease={() => {
                              setSelectedLoanNft({
                                contract: nft.wrappedContractAddress, // Use the WrappedLeasing address
                                tokenId: String(nft.wId), // Use wId for sub-leasing
                                leasingType: 'marketplace'
                              });
                              setShowCollateralSidebar(true);
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Lended NFTs Section */}
                <div>
                  <h3 className="text-xl font-bold mb-4">My Funded Loans</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {lendedNFTs.length === 0 ? (
                      <div className="col-span-full text-center text-muted-foreground py-8 bg-muted/20 rounded-lg">
                        <div className="text-4xl mb-4">💸</div>
                        <p className="mb-4">You are not lending any NFTs.</p>
                        <Button 
                          variant="outline" 
                          onClick={() => window.location.href = '/marketplace'}
                        >
                          Find Loans to Fund
                        </Button>
                      </div>
                    ) : (
                      lendedNFTs.map((nft: any) => {
                        const nftId = typeof nft.id === 'number' ? `local_${nft.id}` : nft.id;
                        const isRentable = false;
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
                            isRentable={isRentable}
                            onClick={() => {
                              window.location.href = `/nft/${nftId}`;
                            }}
                            loanStatus={nft.loanStatus}
                            loanBorrower={nft.loanBorrower}
                            loanLender={nft.loanLender}
                            loanId={nft.loanId}
                            onRequestLoan={() => {
                                setSelectedLoanNft({
                                    contract: nft.contract_address || nft.collection,
                                    tokenId: String(nft.token_id),
                                    loanId: nft.loanId
                                });
                                setShowCollateralSidebar(true);
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </WalletGuard>

      <CollateralLeasingSidebar 
        open={showCollateralSidebar} 
        onOpenChange={setShowCollateralSidebar}
        initialContractAddress={selectedLoanNft?.contract}
        initialTokenId={selectedLoanNft?.tokenId}
        initialLoanId={selectedLoanNft?.loanId}
        initialLeasingType={selectedLoanNft?.leasingType}
      />
      <Footer />
    </div>
  );
};

export default Profile;
