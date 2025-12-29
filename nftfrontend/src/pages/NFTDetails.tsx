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
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Ban
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { nftService } from '@/services/nftService';
import { apiUrl } from '@/config';
import { web3Service } from '@/services/web3Service';
import { ethers } from 'ethers';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';
import { apiService } from '@/services/api';
import { getNFTMarketplaceAddress } from '@/services/configService';
import { AuctionInfo } from '@/components/AuctionInfo';
import { wrappedLeasingApiService } from '@/services/wrappedLeasingApiService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NFTDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address } = useWallet();
  const [nft, setNFT] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [imageLoading, setImageLoading] = useState(true);
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0);
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();
  const [contractAddress, setContractAddress] = useState<string>('');
  const [nftStats, setNftStats] = useState({
    views: 0,
    likes: 0,
    owners: 1,
    lastSale: 'No sales yet',
    totalVolume: '0 ETH',
    properties: []
  });
  const [rentalDetails, setRentalDetails] = useState<any>(null);
  const [loanInfo, setLoanInfo] = useState<any>(null);

  const [following, setFollowing] = useState<any[]>([]);
  const [mintTransactionHash, setMintTransactionHash] = useState<string | null>(null);

  // Relisting state
  const [isRelistDialogOpen, setIsRelistDialogOpen] = useState(false);
  const [isRelisting, setIsRelisting] = useState(false);
  const [isDelisting, setIsDelisting] = useState(false);
  const [relistPrice, setRelistPrice] = useState("");
  const [isAuction, setIsAuction] = useState(false);
  const [auctionDuration, setAuctionDuration] = useState("86400"); // 1 day in seconds

  // Load contract address from config
  useEffect(() => {
    getNFTMarketplaceAddress().then(setContractAddress).catch(console.error);
  }, []);

  // Fetch following list for the current user
  useEffect(() => {
    if (!address) {
      setFollowing([]);
      return;
    }

    const fetchFollowing = async () => {
      try {
        const res = await fetch(apiUrl(`/users/${address}/following/`));
        const data = await res.json();
        if (data.success) {
          setFollowing(data.following || []);
        } else {
          setFollowing([]);
        }
      } catch (error) {
        console.error('[NFTDetails] Error fetching following:', error);
        setFollowing([]);
      }
    };

    fetchFollowing();
  }, [address]);

  useEffect(() => {
    if (!id) return;

    const fetchNFT = async () => {
      setLoading(true);
      try {
        let nftData;
        const res = await fetch(apiUrl(`/nfts/combined/${id}/`));
        const data = await res.json();

        if (data.success) {
          nftData = data.data;
          if (nftData.is_rented && nftData.wId) {
            // If the user purposefully navigated to /nft/:id, auto-redirect for better UX.
            navigate(`/wnft/${nftData.wId}`, { replace: true });
            return;
          }
        } else {
          toast.error(data.error || 'NFT not found');
          navigate('/');
          return;
        }

        setNFT(nftData);

        // Fetch owner and creator profiles
        if (nftData.owner_address) {
          fetch(apiUrl(`/profiles/${nftData.owner_address}/`))
            .then(res => res.json())
            .then(data => {
              if (data.success) setOwner(data.data || data);
              else setOwner({ username: `User${nftData.owner_address.slice(-4)}`, avatar_url: null, verified: false });
            })
            .catch(() => setOwner({ username: `User${nftData.owner_address.slice(-4)}`, avatar_url: null, verified: false }));
        }

        if (nftData.creator_address) {
          fetch(apiUrl(`/profiles/${nftData.creator_address}/`))
            .then(res => res.json())
            .then(data => {
              if (data.success) setCreator(data.data || data);
              else setCreator({ username: `User${nftData.creator_address.slice(-4)}`, avatar_url: null, verified: false });
            })
            .catch(() => setCreator({ username: `User${nftData.creator_address.slice(-4)}`, avatar_url: null, verified: false }));
        }

        // Fetch NFT statistics
        fetchNFTStats(nftData);

        // Fetch rental details if rented
        if (nftData.is_rented && nftData.wId) {
          wrappedLeasingApiService.getWrappedDetails(String(nftData.wId))
            .then(res => {
              if (res.success) setRentalDetails(res.data);
            })
            .catch(err => console.error('Failed to fetch rental details:', err));
        }

        // Fetch loan information
        try {
          const loansRes = await fetch(apiUrl('/loans/open'));
          const loansData = await loansRes.json();
          if (loansData.success && loansData.data) {
            // Find loan for this specific NFT
            const nftLoan = loansData.data.find((loan: any) => {
              const nftContract = nftData.contract_address || contractAddress;
              return loan.nftContract?.toLowerCase() === nftContract?.toLowerCase() &&
                String(loan.tokenId) === String(nftData.token_id) &&
                (loan.status === 'Requested' || loan.status === 'Funded');
            });
            if (nftLoan) {
              setLoanInfo(nftLoan);
            }
          }
        } catch (err) {
          console.error('Failed to fetch loan info:', err);
        }

      } catch (e) {
        console.error('Error fetching NFT:', e);
        toast.error('Failed to load NFT');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    fetchNFT();
  }, [id, navigate, contractAddress]);

  const fetchNFTStats = async (nftData: any) => {
    try {
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
        if (data.success) {
          setActivity(data.data);
          const mintTx = data.data.find((act: any) => act.type === 'mint');
          if (mintTx && mintTx.transaction_hash) {
            setMintTransactionHash(mintTx.transaction_hash);
          }
        }
      } catch (e) {
        console.error('Failed to fetch activity:', e);
      }
    };
    fetchActivity();
  }, [id]);

  useEffect(() => {
    if (nft) {
      setCurrentGatewayIndex(0);
      setImageLoading(true);
      trackNFTView();
    }
  }, [nft?.id]);

  const trackNFTView = async () => {
    if (!nft?.id) return;
    try {
      await fetch(apiUrl(`/nfts/${nft.id}/track-view/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewer_address: address || null })
      });
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
        const actualLikedState = result.liked !== undefined ? result.liked : !likedNFTIds.has(String(nft.id));
        setNftStats(prev => ({
          ...prev,
          likes: typeof result.like_count === 'number' ? result.like_count : prev.likes
        }));
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

  const handleBuyNow = async () => {
    try {
      if (!address) {
        toast.error('Please connect your wallet first');
        return;
      }
      if (!nft) return;
      if (!nft.is_listed || !nft.price || nft.price === '0') {
        toast.error('This NFT is not for sale');
        return;
      }
      if (nft.owner_address && nft.owner_address.toLowerCase() === address.toLowerCase()) {
        toast.error('You already own this NFT');
        return;
      }

      const tokenId: number = Number(nft.token_id);
      const priceStr: string = typeof nft.price === 'string' ? nft.price : nft.price.toString();
      const priceInWei = ethers.parseEther(priceStr);

      const signer = web3Service.getSigner();
      const balance = await signer.provider.getBalance(address);

      const contract = web3Service.getContract();
      const gasEstimate = await contract.buyNFT.estimateGas(tokenId, { value: priceInWei });
      const gasPrice = await signer.provider.getFeeData();
      const gasCost = gasEstimate * (gasPrice.gasPrice || ethers.parseUnits('20', 'gwei'));

      const totalCost = priceInWei + gasCost;

      if (balance < totalCost) {
        toast.error('Insufficient balance to complete this purchase (including gas fees)');
        return;
      }

      toast.loading('Confirm the purchase in your wallet...', { id: 'buy' });

      const tx = await web3Service.buyNFT(tokenId, priceStr);
      const receipt = await web3Service.waitForTransaction(tx);

      try {
        await fetch(apiUrl(`/nfts/${tokenId}/transfer/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_owner: address,
            transaction_hash: receipt?.hash || tx.hash,
            price: priceStr
          })
        });
        await fetch(apiUrl(`/nfts/${tokenId}/set_listed/`), { method: 'POST' });
      } catch (e) {
        console.warn('Backend ownership update failed (continuing):', e);
      }

      setNFT((prev: any) => prev ? { ...prev, owner_address: address, is_listed: false } : prev);
      toast.success('Purchase successful!', { id: 'buy' });
    } catch (err: any) {
      console.error('[NFTDetails] Buy failed:', err);
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || err?.message?.includes('User denied')) {
        toast.error('Transaction cancelled by user', { id: 'buy' });
      } else if (err?.code === 'INSUFFICIENT_FUNDS' || err?.message?.includes('insufficient funds')) {
        toast.error('Insufficient funds in your wallet', { id: 'buy' });
      } else {
        toast.error(err.message || 'Purchase failed', { id: 'buy' });
      }
    }
  };

  const handleMakeOffer = () => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }
    navigate(`/nft/${id}/offer`);
  };

  const handleRelist = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!relistPrice || isNaN(Number(relistPrice)) || Number(relistPrice) <= 0) {
      toast.error("Please enter a valid price");
      return;
    }

    setIsRelisting(true);
    const toastId = toast.loading("Listing NFT on blockchain...");

    try {
      const tokenId = Number(nft.token_id);
      const duration = isAuction ? Number(auctionDuration) : 0;

      const tx = await web3Service.listNFT(tokenId, relistPrice, isAuction, duration);
      toast.loading("Waiting for transaction confirmation...", { id: toastId });
      const receipt = await web3Service.waitForTransaction(tx);

      if (receipt) {
        toast.loading("Updating backend...", { id: toastId });
        const response = await fetch(apiUrl(`/nfts/${tokenId}/set_listed/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
          toast.success("NFT listed successfully!", { id: toastId });
          setIsRelistDialogOpen(false);
          window.location.reload();
        } else {
          toast.error(data.error || "Failed to update backend", { id: toastId });
        }
      }
    } catch (error: any) {
      console.error("Relisting error:", error);
      toast.error(error.message || "Failed to list NFT", { id: toastId });
    } finally {
      setIsRelisting(false);
    }
  };

  const handleDelist = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    setIsDelisting(true);
    const toastId = toast.loading("Removing NFT from sale...");

    try {
      const tokenId = Number(nft.token_id);

      const tx = await web3Service.delistNFT(tokenId);
      toast.loading("Waiting for transaction confirmation...", { id: toastId });
      const receipt = await web3Service.waitForTransaction(tx);

      if (receipt) {
        toast.loading("Updating backend...", { id: toastId });
        const response = await fetch(apiUrl(`/nfts/${tokenId}/set_listed/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
          toast.success("NFT removed from sale successfully!", { id: toastId });
          window.location.reload();
        } else {
          toast.error(data.error || "Failed to update backend", { id: toastId });
        }
      }
    } catch (error: any) {
      console.error("Delisting error:", error);
      toast.error(error.message || "Failed to remove NFT from sale", { id: toastId });
    } finally {
      setIsDelisting(false);
    }
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

  const isOwner = !!address && !!nft.owner_address && address.toLowerCase() === nft.owner_address.toLowerCase();

  const formatPrice = (price: any) => {
    if (nft?.is_rented) return 'Currently Rented';
    if (!nft?.is_listed || !price || price === '0') return 'Not for sale';
    return `Ξ${typeof price === 'string' ? price : price.toString()}`;
  };

  const getNFTImageUrl = () => {
    if (!nft) return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBJbWFnZTwvdGV4dD48L3N2Zz4=';
    let imageUrl = nft.image_url || '';
    if (!imageUrl && nft.blockchain_data && nft.blockchain_data.image) imageUrl = nft.blockchain_data.image;
    if (imageUrl && imageUrl.startsWith('ipfs://')) {
      const ipfsHash = imageUrl.replace('ipfs://', '');
      const gateways = [
        `https://ipfs.io/ipfs/${ipfsHash}`,
        `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      ];
      imageUrl = gateways[currentGatewayIndex] || gateways[0];
    }
    if (imageUrl && imageUrl.includes('ipfs/') && !imageUrl.startsWith('http')) imageUrl = `https://ipfs.io/${imageUrl}`;
    // Return placeholder if no valid URL
    return imageUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBJbWFnZTwvdGV4dD48L3N2Zz4=';
  };

  const getProfileImageUrl = (profile: any) => profile?.avatar_url || profile?.profile_image || '';
  const getProfileDisplayName = (profile: any, address: string) => profile?.username || profile?.name || address?.slice(0, 6) + '...' + address?.slice(-4) || 'Unknown';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <img
          src={getNFTImageUrl()}
          alt="NFT Cover"
          className="w-full h-full object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            if (currentGatewayIndex < 4) {
              setCurrentGatewayIndex(prev => prev + 1);
            } else {
              img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBDb3ZlcjwvdGV4dD48L3N2Zz4=';
            }
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
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
                    if (currentGatewayIndex < 4) setCurrentGatewayIndex(prev => prev + 1);
                    else e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBJbWFnZTwvdGV4dD48L3N2Zz4=';
                  }}
                />
                <div className="absolute top-4 right-4 flex gap-2">
                  <Button variant="secondary" size="icon" className="bg-background/80 backdrop-blur-md hover:bg-background/90" onClick={handleLikeToggle}>
                    <Heart className={`h-4 w-4 ${likedNFTIds.has(String(nft.id)) ? 'fill-red-500 text-red-500' : ''}`} />
                  </Button>
                  <Button variant="secondary" size="icon" className="bg-background/80 backdrop-blur-md hover:bg-background/90"><Share2 className="h-4 w-4" /></Button>
                  <Button variant="secondary" size="icon" className="bg-background/80 backdrop-blur-md hover:bg-background/90"><MoreHorizontal className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">{typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}</Badge>
                    {nft.is_rented && <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white border-0">RENTED</Badge>}
                    {nft.is_rentable && !nft.is_rented && <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0">LISTED FOR RENT</Badge>}
                  </div>
                  <h1 className="text-3xl font-bold gradient-text mb-2">{nft.name}</h1>
                  <p className="text-muted-foreground leading-relaxed">{nft.description || 'No description available'}</p>
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><Eye className="h-4 w-4" /><span>{nftStats.views.toLocaleString()} views</span></div>
                  <div className="flex items-center gap-2"><Heart className="h-4 w-4" /><span>{nftStats.likes.toLocaleString()} likes</span></div>
                  <div className="flex items-center gap-2"><Users className="h-4 w-4" /><span>{nftStats.owners} owners</span></div>
                </div>
              </div>
            </Card>

            <Card className="glass-card p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="properties">Properties</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-6 space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-card/50 rounded-lg p-4"><div className="text-sm text-muted-foreground mb-1">Token ID</div><div className="font-semibold">{nft.token_id}</div></div>
                    <div className="bg-card/50 rounded-lg p-4"><div className="text-sm text-muted-foreground mb-1">Blockchain</div><div className="font-semibold">Ethereum</div></div>
                    <div className="bg-card/50 rounded-lg p-4"><div className="text-sm text-muted-foreground mb-1">Last Sale</div><div className="font-semibold text-green-500">{nftStats.lastSale}</div></div>
                    <div className="bg-card/50 rounded-lg p-4"><div className="text-sm text-muted-foreground mb-1">Total Volume</div><div className="font-semibold text-blue-500">{nftStats.totalVolume}</div></div>
                  </div>
                  {mintTransactionHash && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Transaction Hash</h3>
                      <div className="flex items-center gap-2 p-3 bg-card/50 rounded-lg">
                        <code className="text-sm text-muted-foreground flex-1 overflow-hidden text-ellipsis">{mintTransactionHash}</code>
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(mintTransactionHash)}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => window.open(`https://sepolia.etherscan.io/tx/${mintTransactionHash}`, '_blank')}><ExternalLink className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Contract Address</h3>
                    <div className="flex items-center gap-2 p-3 bg-card/50 rounded-lg">
                      <code className="text-sm text-muted-foreground flex-1 overflow-hidden text-ellipsis">{contractAddress || 'Loading...'}</code>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(contractAddress)} disabled={!contractAddress}><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => window.open(`https://sepolia.etherscan.io/address/${contractAddress}`, '_blank')} disabled={!contractAddress}><ExternalLink className="h-4 w-4" /></Button>
                    </div>
                  </div>

                  {nft.is_rented && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-6 mt-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                          <Clock className="h-5 w-5 text-indigo-500" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-indigo-500 italic">Active Rental</h3>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">This NFT is currently leased out</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Current Renter</p>
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono bg-background/50 px-2 py-1 rounded border border-border/10">
                                {rentalDetails?.rental?.renter || 'Loading...'}
                              </code>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(rentalDetails?.rental?.renter)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Lease Expiry</p>
                            <p className="font-semibold">
                              {rentalDetails?.rental?.expiresAt ? new Date(rentalDetails.rental.expiresAt).toLocaleString() : 'Loading...'}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Rental Terms</p>
                            <div className="flex items-center gap-4">
                              <div className="text-center bg-background/30 rounded-lg p-2 flex-1">
                                <p className="text-[10px] text-muted-foreground font-bold italic">PRICE</p>
                                <p className="text-sm font-bold">Ξ{rentalDetails?.rental?.rentAmount || '0.00'}</p>
                              </div>
                              <div className="text-center bg-background/30 rounded-lg p-2 flex-1">
                                <p className="text-[10px] text-muted-foreground font-bold italic">DEPOSIT</p>
                                <p className="text-sm font-bold">Ξ{rentalDetails?.rental?.depositAmount || '0.00'}</p>
                              </div>
                            </div>
                          </div>
                          <Button
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold"
                            onClick={() => navigate(`/wnft/${nft.wId}`)}
                          >
                            View Wrapped Details <ExternalLink className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="properties" className="mt-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {nftStats.properties.length > 0 ? nftStats.properties.map((property: any, index: number) => (
                      <div key={index} className="bg-card/50 rounded-lg p-4 text-center">
                        <div className="text-sm text-accent-foreground font-medium mb-1">{property.trait_type || property.trait}</div>
                        <div className="font-semibold mb-2">{property.value}</div>
                        {property.rarity && <Badge variant="outline" className="text-xs">{property.rarity} rare</Badge>}
                      </div>
                    )) : <div className="col-span-full text-center text-muted-foreground py-8">No properties available.</div>}
                  </div>
                </TabsContent>
                <TabsContent value="activity" className="mt-6">
                  <div className="space-y-4">
                    {activity.length === 0 ? (
                      <div className="text-center text-muted-foreground py-12 bg-card/30 rounded-xl border border-dashed border-border">
                        <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>No activity yet.</p>
                      </div>
                    ) : activity.map((act: any, index) => {
                      const getActivityIcon = (type: string) => {
                        switch (type) {
                          case 'mint': return <Zap className="h-4 w-4 text-blue-500" />;
                          case 'list': return <TrendingUp className="h-4 w-4 text-purple-500" />;
                          case 'buy': return <DollarSign className="h-4 w-4 text-green-500" />;
                          case 'transfer': return <ArrowRight className="h-4 w-4 text-orange-500" />;
                          case 'rent_listed': return <Clock className="h-4 w-4 text-indigo-500" />;
                          case 'rented': return <Users className="h-4 w-4 text-pink-500" />;
                          case 'depositrefunded': return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
                          case 'cancelled': return <Ban className="h-4 w-4 text-red-500" />;
                          case 'withdrawn': return <RotateCcw className="h-4 w-4 text-yellow-500" />;
                          default: return <TrendingUp className="h-4 w-4 text-muted-foreground" />;
                        }
                      };

                      const getActivityLabel = (type: string) => {
                        switch (type) {
                          case 'mint': return 'Minted';
                          case 'list': return 'Listed';
                          case 'buy': return 'Purchased';
                          case 'transfer': return 'Transferred';
                          case 'rent_listed': return 'Listed for Rent';
                          case 'rented': return 'Rented';
                          case 'depositrefunded': return 'Deposit Refunded';
                          case 'cancelled': return 'Cancelled';
                          case 'withdrawn': return 'Withdrawn';
                          default: return type.charAt(0).toUpperCase() + type.slice(1);
                        }
                      };

                      return (
                        <div key={index} className="flex items-center gap-4 p-4 bg-card/50 rounded-lg hover:bg-card/80 transition-colors border border-border/10">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center border border-border/20 shadow-sm">
                            {getActivityIcon(act.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-foreground">{getActivityLabel(act.type)}</span>
                              {act.price && <Badge variant="secondary" className="font-mono text-xs font-bold text-primary">{act.price} ETH</Badge>}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">From {act.from?.name || 'Unknown'}</span>
                              <ArrowRight className="h-3 w-3 opacity-30" />
                              <span className="truncate">To {act.to?.name || 'N/A'}</span>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <div className="text-sm font-medium text-foreground">{act.time_ago}</div>
                            <div className="text-[10px] text-muted-foreground">{act.timestamp ? new Date(act.timestamp).toLocaleDateString() : ''}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="glass-card p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1 flex items-center justify-between">
                    Current Price
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => setActiveTab('activity')}>
                      View History
                    </Button>
                  </div>
                  <div className="text-3xl font-bold text-green-500">{formatPrice(nft.price)}</div>
                  <div className="text-lg text-muted-foreground">
                    {nft.is_rented ? 'Current lease active' : nft.price && nft.price !== '0' ? `$${(parseFloat(nft.price.toString()) * 1700).toFixed(2)}` : 'Not for sale'}
                  </div>
                </div>

                {nft.is_listed && !isOwner && !loanInfo && (
                  <div className={`grid ${!(nft.is_auction || nft.isAuction) ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                    {!(nft.is_auction || nft.isAuction) && <Button className="bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 transition-smooth" onClick={handleBuyNow}>Buy Now</Button>}
                    <Button variant="outline" onClick={handleMakeOffer}>Make Offer</Button>
                  </div>
                )}

                {nft.is_listed && isOwner && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                      You are the current owner of this NFT. Other users can see and buy this listing.
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={handleDelist}
                      disabled={isDelisting}
                    >
                      {isDelisting ? "Delisting..." : "Remove from Sale"}
                    </Button>
                  </div>
                )}

                {!nft.is_listed && isOwner && (
                  <Button
                    className="w-full bg-gradient-to-r from-primary to-primary/80"
                    onClick={() => setIsRelistDialogOpen(true)}
                  >
                    List for Sale
                  </Button>
                )}

                {loanInfo && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-500">Locked as Collateral</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        This NFT is currently locked as collateral for an active loan and cannot be purchased or transferred.
                      </p>
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <Button variant="ghost" className="text-accent-foreground"><TrendingUp className="h-4 w-4 mr-2" />View Price History</Button>
                </div>
              </div>
            </Card>

            {loanInfo && (
              <Card className="glass-card p-6 border-amber-500/20">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-500" />
                  Collateral Loan
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <Badge className={loanInfo.status === 'Funded' ? 'bg-green-500' : 'bg-yellow-500'}>
                        {loanInfo.status}
                      </Badge>
                    </div>
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Principal</div>
                      <div className="font-semibold">Ξ{loanInfo.principal}</div>
                    </div>
                  </div>

                  <div className="bg-card/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">Borrower</div>
                    <div className="font-mono text-sm truncate">{loanInfo.borrower}</div>
                  </div>

                  {loanInfo.lender && loanInfo.lender !== ethers.ZeroAddress && (
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Lender</div>
                      <div className="font-mono text-sm truncate">{loanInfo.lender}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Interest Rate</div>
                      <div className="font-semibold">{(loanInfo.interestBps / 100).toFixed(2)}%</div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Duration</div>
                      <div className="font-semibold">{Math.floor(loanInfo.duration / 86400)} days</div>
                    </div>
                  </div>

                  {loanInfo.status === 'Funded' && loanInfo.startTime && (
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">Due Date</div>
                      <div className="font-semibold">
                        {new Date((loanInfo.startTime + loanInfo.duration) * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            <AuctionInfo nft={nft} onAuctionEnded={() => window.location.reload()} />

            <Card className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Creator</h3>
              <div className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors" onClick={() => navigate(`/profile/${nft.creator_address}`)}>
                <Avatar className="h-12 w-12"><AvatarImage src={getProfileImageUrl(creator)} /><AvatarFallback>{getProfileDisplayName(creator, nft.creator_address).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">{getProfileDisplayName(creator, nft.creator_address)}{creator?.verified && <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}</div>
                  <div className="text-sm text-muted-foreground break-all overflow-hidden text-ellipsis max-w-[200px]">{nft.creator_address}</div>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  if (!address) { toast.error('Please connect your wallet first'); return; }
                  if (!creator || !creator.wallet_address) { toast.error('Creator address not available'); return; }
                  try {
                    const isFollowing = following.some(f => f.wallet_address === creator.wallet_address);
                    if (isFollowing) {
                      const res = await apiService.unfollowUser(creator.wallet_address, address);
                      if (res.success) { toast.success('Unfollowed successfully'); setFollowing(prev => prev.filter(f => f.wallet_address !== creator.wallet_address)); }
                      else toast.error(res.error || 'Failed to unfollow');
                    } else {
                      const res = await apiService.followUser(creator.wallet_address, address);
                      if (res.success) { toast.success('Followed successfully'); setFollowing(prev => [...prev, { wallet_address: creator.wallet_address, username: creator.username, avatar_url: creator.avatar_url }]); }
                      else toast.error(res.error || 'Failed to follow');
                    }
                  } catch (error) { console.error('Follow/unfollow error:', error); toast.error('Failed to update follow status'); }
                }}
              >
                {following.some(f => f.wallet_address === creator?.wallet_address) ? 'Unfollow' : 'Follow Creator'}
              </Button>
            </Card>

            <Card className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Current Owner</h3>
              <div className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors" onClick={() => navigate(`/profile/${nft.owner_address}`)}>
                <Avatar className="h-12 w-12"><AvatarImage src={getProfileImageUrl(owner)} /><AvatarFallback>{getProfileDisplayName(owner, nft.owner_address).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">{getProfileDisplayName(owner, nft.owner_address)}{owner?.verified && <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}</div>
                  <div className="text-sm text-muted-foreground break-all overflow-hidden text-ellipsis max-w-[200px]">{nft.owner_address}</div>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Owned Since</span><span>{nft.created_at ? new Date(nft.created_at).toLocaleDateString() : 'Unknown'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total NFTs Owned</span><span className="font-semibold">{owner?.total_nfts || 'Unknown'}</span></div>
              </div>
              <Button variant="outline" className="w-full">View Collection</Button>
            </Card>

            <Card className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Minting Details</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Minted on</span><span className="font-medium">{nft.created_at ? new Date(nft.created_at).toLocaleDateString() : 'Unknown'}</span></div>
                <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Time</span><span className="font-medium">{nft.created_at ? new Date(nft.created_at).toLocaleTimeString() : 'Unknown'}</span></div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Relist Dialog */}
      <Dialog open={isRelistDialogOpen} onOpenChange={setIsRelistDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>List NFT for Sale</DialogTitle>
            <DialogDescription>
              Set your price and choose between a fixed price listing or an auction.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="price">Price (ETH)</Label>
              <Input
                id="price"
                placeholder="0.05"
                value={relistPrice}
                onChange={(e) => setRelistPrice(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="auction-mode">Auction Mode</Label>
              <Switch
                id="auction-mode"
                checked={isAuction}
                onCheckedChange={setIsAuction}
              />
            </div>
            {isAuction && (
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration</Label>
                <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3600">1 Hour</SelectItem>
                    <SelectItem value="21600">6 Hours</SelectItem>
                    <SelectItem value="43200">12 Hours</SelectItem>
                    <SelectItem value="86400">1 Day</SelectItem>
                    <SelectItem value="259200">3 Days</SelectItem>
                    <SelectItem value="604800">1 Week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRelistDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRelist} disabled={isRelisting}>
              {isRelisting ? "Listing..." : "List NFT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default NFTDetails;