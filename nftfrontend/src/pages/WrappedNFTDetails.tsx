import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, ArrowLeft, ExternalLink, DollarSign, Copy, Check, Shield, Info, Zap, RefreshCw, TrendingUp, Users, ShieldCheck, Ban, RotateCcw, ArrowRight } from 'lucide-react';
import { wrappedLeasingApiService } from '@/services/wrappedLeasingApiService';
import { apiUrl } from '@/config';
import { useWallet } from '@/contexts/WalletContext';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import CollateralLeasingSidebar from '@/components/CollateralLeasingSidebar';

interface WrappedInfo {
  originalNft: string;
  originalTokenId: string;
  // Current holder of the wNFT (may be renter or original owner)
  owner: string;
  // Original owner who wrapped the NFT (from contract)
  originalOwner?: string;
  validUntil: number;
  active: boolean;
  pricePerSecond?: bigint;
}

interface LeaseStatus {
  isActive: boolean;
  timeRemaining: number;
}

interface RentalDetails {
  rentAmount?: string;
  depositAmount?: string;
  pricePerSecond?: string;
  rentDuration?: number;
  expiresAt?: string;
  renter?: string;
  rentedAt?: string;
}

const getImageUrl = (url: string) => {
  if (!url) return url;
  // Strip any extra query params
  const clean = url.split('?')[0];

  if (clean.startsWith('ipfs://')) {
    // Handle ipfs://ipfs/HASH and ipfs://HASH
    const hash = clean.replace('ipfs://', '').replace('ipfs/', '');
    return `https://gateway.pinata.cloud/ipfs/${hash}`;
  }

  // Handle cases where the URL might be a gateway URL but we want to standardize
  // This ensures we always start with our primary gateway (Pinata) and fallback from there
  if (clean.includes('/ipfs/')) {
    const hash = clean.split('/ipfs/')[1];
    if (hash) {
      return `https://gateway.pinata.cloud/ipfs/${hash}`;
    }
  }

  return clean;
};

const WrappedNFTDetails: React.FC = () => {
  const { wId } = useParams<{ wId: string }>();
  const navigate = useNavigate();
  const { address } = useWallet();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wrappedInfo, setWrappedInfo] = useState<WrappedInfo | null>(null);
  const [leaseStatus, setLeaseStatus] = useState<LeaseStatus | null>(null);
  const [metadata, setMetadata] = useState<any | null>(null);
  const [dbWrapped, setDbWrapped] = useState<any | null>(null);
  const [dbStatus, setDbStatus] = useState<string | null>(null);
  const [rentalDetails, setRentalDetails] = useState<RentalDetails | null>(null);
  const [subLeaseDetails, setSubLeaseDetails] = useState<RentalDetails | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const [showSubLeaseSidebar, setShowSubLeaseSidebar] = useState(false);
  const [wrappedLeasingAddress, setWrappedLeasingAddress] = useState<string>('');
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    if (!wId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1) Fetch wrapped info + lease status from backend (which talks to contract)
        const [info, status, dbDetails] = await Promise.all([
          wrappedLeasingApiService.getWrappedInfo(wId),
          wrappedLeasingApiService.getLeaseStatus(wId),
          wrappedLeasingApiService.getWrappedDetails(wId),
        ]);

        setWrappedInfo({
          originalNft: info.originalNft,
          originalTokenId: info.originalTokenId,
          owner: info.owner,
          originalOwner: info.originalOwner,
          validUntil: info.validUntil,
          active: info.active,
        });

        setLeaseStatus({
          isActive: status.isActive,
          timeRemaining: status.timeRemaining,
        });

        if (dbDetails?.success && dbDetails.data) {
          const wrappedDb = dbDetails.data.wrapped;
          const rentalDb = dbDetails.data.rental;
          if (wrappedDb) {
            setDbWrapped(wrappedDb);
            setDbStatus(wrappedDb.status);
          }
          if (rentalDb) {
            setRentalDetails({
              rentAmount: rentalDb.rentAmount,
              depositAmount: rentalDb.depositAmount,
              pricePerSecond: rentalDb.pricePerSecond,
              rentDuration: rentalDb.rentDuration,
              expiresAt: rentalDb.expiresAt,
              renter: rentalDb.renter,
              rentedAt: rentalDb.createdAt
            });
          }

          if (dbDetails.data.subLease) {
            const slDb = dbDetails.data.subLease;
            setSubLeaseDetails({
              rentAmount: slDb.rentAmount,
              depositAmount: slDb.depositAmount,
              pricePerSecond: slDb.pricePerSecond,
              rentDuration: slDb.rentDuration,
              expiresAt: slDb.expiresAt,
              renter: slDb.renter,
              rentedAt: slDb.createdAt
            });
          } else {
            setSubLeaseDetails(null);
          }
        }

        // 2) Try to load metadata for the original NFT via existing backend endpoint.
        const originalContract =
          (dbDetails?.success && dbDetails.data?.wrapped?.originalNftContract) ||
          info.originalNft;
        const originalTokenId =
          (dbDetails?.success && dbDetails.data?.wrapped?.originalTokenId) ||
          info.originalTokenId;

        if (
          originalContract &&
          originalContract !== '0x0000000000000000000000000000000000000000' &&
          originalTokenId !== '0'
        ) {
          try {
            const externalUrl = apiUrl(`/nfts/external/${originalContract}/${originalTokenId}`);
            const res = await fetch(externalUrl);
            const data = await res.json();
            if (data.success && data.data) {
              setMetadata(data.data);
            }
          } catch (e) {
            console.error('[WrappedNFTDetails] Failed to fetch external metadata:', e);
          }
        }
      } catch (e: any) {
        console.error('Failed to load wrapped NFT details', e);
        setError(e?.message || 'Failed to load wrapped NFT details');
      } finally {
        setLoading(false);
      }
    };

    const fetchActivities = async () => {
      if (!dbWrapped?.originalNftContract || !dbWrapped?.originalTokenId) return;

      setLoadingActivities(true);
      try {
        // Need to find the NFT ID first to fetch activities
        const nftRes = await fetch(apiUrl(`/nfts/external/${dbWrapped.originalNftContract}/${dbWrapped.originalTokenId}`));
        const nftData = await nftRes.json();

        if (nftData.success && nftData.data) {
          const actRes = await fetch(apiUrl(`/activities?nft=${nftData.data._id || nftData.data.id.replace('local_', '')}&limit=10`));
          const actData = await actRes.json();
          if (actData.success) {
            setActivities(actData.data);
          }
        }
      } catch (e) {
        console.error('Failed to fetch activities:', e);
      } finally {
        setLoadingActivities(false);
      }
    };

    const fetchContractInfo = async () => {
      try {
        const info = await wrappedLeasingApiService.getContractInfo();
        setWrappedLeasingAddress(info.wrappedLeasingAddress);
      } catch (e) {
        console.error('Failed to fetch contract info', e);
      }
    };

    loadData();
    fetchContractInfo();
  }, [wId]);

  useEffect(() => {
    if (dbWrapped?.originalNftContract && dbWrapped?.originalTokenId) {
      // Small delay to ensure state is settled
      const timer = setTimeout(() => {
        const fetchActivities = async () => {
          setLoadingActivities(true);
          try {
            // Get original NFT record
            const nftRes = await fetch(apiUrl(`/nfts/external/${dbWrapped.originalNftContract}/${dbWrapped.originalTokenId}`));
            const nftData = await nftRes.json();

            if (nftData.success && nftData.data) {
              const actualId = nftData.data._id || nftData.data.id.replace('local_', '');
              const actRes = await fetch(apiUrl(`/activities?nft=${actualId}&limit=10`));
              const actData = await actRes.json();
              if (actData.success) {
                setActivities(actData.data);
              }
            }
          } catch (e) {
            console.error('Failed to fetch activities:', e);
          } finally {
            setLoadingActivities(false);
          }
        };
        fetchActivities();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [dbWrapped]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
    toast.success('Address copied to clipboard');
  };

  const handleTransactionError = (error: any, defaultMessage: string) => {
    console.error(defaultMessage, error);
    toast.dismiss();

    // Check for user rejection patterns (Ethers v6)
    if (
      error?.code === 4001 ||
      error?.code === 'ACTION_REJECTED' ||
      error?.reason === 'rejected' ||
      error?.info?.error?.code === 4001 ||
      error?.message?.toLowerCase().includes('user denied') ||
      error?.message?.toLowerCase().includes('user rejected') ||
      error?.message?.toLowerCase().includes('transaction cancelled')
    ) {
      toast.error('Transaction cancelled by user');
      return;
    }

    // Check for other common errors
    if (error?.message?.toLowerCase().includes('insufficient funds') || error?.code === 'INSUFFICIENT_FUNDS') {
      toast.error('Insufficient funds in your wallet');
      return;
    }

    // Attempt to extract reason
    let errorReason = '';
    if (error?.reason) errorReason = error.reason;
    else if (error?.error?.message) errorReason = error.error.message;
    else if (error?.message) {
      if (error.message.includes('revert')) {
        const match = error.message.match(/revert (.*)/);
        if (match) errorReason = match[1];
      }
    }

    if (errorReason) {
      toast.error(`${defaultMessage}: ${errorReason}`);
    } else {
      toast.error(defaultMessage);
    }
  };

  const handleUnwrap = async () => {
    if (!wId) return;
    setIsUnwrapping(true);
    try {
      await wrappedLeasingApiService.unwrapNFT(wId, address || undefined);
      toast.success('NFT successfully unwrapped!');
      navigate('/profile');
    } catch (e: any) {
      handleTransactionError(e, 'Failed to unwrap NFT');
    } finally {
      setIsUnwrapping(false);
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const formatWeiToEth = (wei: string | undefined, decimals: number = 6) => {
    if (!wei || wei === '0') return '0';
    try {
      const eth = ethers.formatEther(wei);
      const num = parseFloat(eth);

      // If the number is very small but not zero, use more decimals or scientific notation
      if (num > 0 && num < 0.000001) {
        return num.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 18,
        });
      }

      return eth;
    } catch (e) {
      return wei;
    }
  };

  const [imageError, setImageError] = useState(false);

  // Derive and resolve image URL in one place
  const resolvedImageUrl = useMemo(() => {
    const metaAny = metadata as any;
    if (!metaAny) return undefined;

    let raw: string | undefined;
    if (metaAny.image_url) raw = metaAny.image_url;
    else if (metaAny.image) raw = metaAny.image;
    else if (metaAny.metadata?.image) raw = metaAny.metadata.image;
    else if (metaAny.image_data) raw = metaAny.image_data;
    else if (metaAny.media) raw = metaAny.media;
    else if (metaAny.animation_url) raw = metaAny.animation_url;
    else if (metaAny.artifactUri) raw = metaAny.artifactUri;
    else if (metaAny.displayUri) raw = metaAny.displayUri;
    else if (metaAny.thumbnailUri) raw = metaAny.thumbnailUri;
    else if (typeof metaAny.token_uri === 'string') {
      const uri = metaAny.token_uri;
      if (uri.startsWith('ipfs://') || uri.startsWith('http')) raw = uri;
    }

    if (!raw) return undefined;
    if (typeof raw !== 'string') return undefined;

    return getImageUrl(raw);
  }, [metadata]);

  // Debug logging for metadata and image
  useEffect(() => {
    if (metadata) {
      console.log('[WrappedNFTDetails] Metadata loaded:', metadata);
      console.log('[WrappedNFTDetails] Resolved Image URL:', resolvedImageUrl);
    }
  }, [metadata, resolvedImageUrl]);

  // Perspective-based ownership info
  const currentHolder: string | undefined =
    rentalDetails?.renter ||
    dbWrapped?.currentHolder || // if backend stores it
    wrappedInfo?.owner;

  const originalOwner: string | undefined =
    dbWrapped?.owner || // DB "owner" is typically the original owner who wrapped
    wrappedInfo?.originalOwner;

  const isCurrentHolder =
    !!address &&
    !!currentHolder &&
    address.toLowerCase() === currentHolder.toLowerCase();

  const isOriginalOwnerUser =
    !!address &&
    !!originalOwner &&
    address.toLowerCase() === originalOwner.toLowerCase();

  return (
    <div className="min-h-screen bg-background selection:bg-primary/30">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumbs / Back Button */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-full hover:bg-primary/10 hover:text-primary transition-all duration-300 border border-border/40"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold border-primary/30 text-primary/80 px-2 py-0">
                  Wrapped Asset
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">ID: #{wId}</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-500 to-blue-600">
                    {metadata?.name || `Wrapped NFT #${wId}`}
                  </span>
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => window.location.reload()}
                  title="Refresh Metadata"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(isCurrentHolder || isOriginalOwnerUser) && leaseStatus?.timeRemaining === 0 && (
              <Button
                onClick={handleUnwrap}
                disabled={isUnwrapping}
                className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-8 rounded-full h-11 font-bold transition-all hover:scale-105 active:scale-95"
              >
                {isUnwrapping ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Unwrapping...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4 fill-current" />
                    {isOriginalOwnerUser ? 'Reclaim NFT' : 'Unwrap NFT'}
                  </>
                )}
              </Button>
            )}
            {isCurrentHolder && leaseStatus && leaseStatus.timeRemaining > 0 && (
              <Button
                onClick={() => setShowSubLeaseSidebar(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg shadow-purple-500/20 px-8 rounded-full h-11 font-bold transition-all hover:scale-105 active:scale-95"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Sub-lease NFT
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-32 space-y-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-t-2 border-b-2 border-primary animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary animate-pulse" />
              </div>
            </div>
            <p className="text-muted-foreground font-medium animate-pulse">Synchronizing with blockchain...</p>
          </div>
        ) : error ? (
          <Card className="border-destructive/20 bg-destructive/5 backdrop-blur-sm overflow-hidden animate-in zoom-in-95 duration-500">
            <CardContent className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive mb-6">
                <Info className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-destructive mb-2">Connection Error</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">{error}</p>
              <Button variant="outline" onClick={() => window.location.reload()} className="rounded-full px-8">
                Retry Connection
              </Button>
            </CardContent>
          </Card>
        ) : !wrappedInfo ? (
          <Card className="glass-card border-dashed">
            <CardContent className="py-20 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground mb-6">
                <Shield className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Asset Not Found</h3>
              <p className="text-muted-foreground max-w-md mx-auto">This wrapped NFT could not be located on the blockchain. It may have been unwrapped or the ID is incorrect.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left Column: Media & Description */}
            <div className="lg:col-span-5 space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
              <div className="group relative aspect-square rounded-3xl overflow-hidden bg-muted border border-border/40 shadow-2xl transition-all duration-500 hover:shadow-primary/10">
                {resolvedImageUrl && !imageError ? (
                  <img
                    src={resolvedImageUrl}
                    alt={metadata?.name || `Wrapped NFT #${wId}`}
                    onLoad={() => console.log('[WrappedNFTDetails] Image loaded successfully:', resolvedImageUrl)}
                    onError={async (e) => {
                      const img = e.target as HTMLImageElement;
                      const currentSrc = img.src;
                      console.warn('[WrappedNFTDetails] Image failed to load:', currentSrc);

                      // List of gateways to try in order
                      const gateways = [
                        'https://ipfs.io/ipfs/',
                        'https://gateway.pinata.cloud/ipfs/',
                        'https://nftstorage.link/ipfs/',
                        'https://dweb.link/ipfs/',
                        'https://gateway.ipfs.io/ipfs/'
                      ];

                      // Extract hash from current URL
                      let hash = '';

                      // Try to find /ipfs/ in the URL
                      const ipfsIndex = currentSrc.indexOf('/ipfs/');
                      if (ipfsIndex !== -1) {
                        hash = currentSrc.substring(ipfsIndex + 6);
                      }

                      if (!hash) {
                        console.warn('[WrappedNFTDetails] Could not extract hash from URL:', currentSrc);
                        setImageError(true);
                        return;
                      }

                      // Determine which gateway we just tried
                      const currentGateway = gateways.find(gw => currentSrc.startsWith(gw));
                      let nextGatewayIndex = 0;

                      if (currentGateway) {
                        nextGatewayIndex = gateways.indexOf(currentGateway) + 1;
                      }

                      if (nextGatewayIndex < gateways.length) {
                        const nextGateway = gateways[nextGatewayIndex];
                        console.log(`[WrappedNFTDetails] Retrying with next gateway: ${nextGateway}`);
                        img.src = `${nextGateway}${hash}`;
                      } else {
                        console.warn('[WrappedNFTDetails] All gateways exhausted. Checking if this is metadata JSON...');

                        // Try to fetch it as JSON, maybe it's metadata?
                        try {
                          // Use the first gateway (Pinata) for this check as it's most reliable
                          const metadataUrl = `https://gateway.pinata.cloud/ipfs/${hash}`;
                          const response = await fetch(metadataUrl);
                          if (response.ok) {
                            const contentType = response.headers.get('content-type');
                            if (contentType && contentType.includes('application/json')) {
                              const fetchedMetadata = await response.json();
                              if (fetchedMetadata.image) {
                                console.log('[WrappedNFTDetails] Found image in metadata JSON:', fetchedMetadata.image);
                                // Recursively use getImageUrl to handle the new IPFS URI
                                img.src = getImageUrl(fetchedMetadata.image);
                                return;
                              }
                            }
                          }
                        } catch (err) {
                          console.error('[WrappedNFTDetails] Failed to check metadata:', err);
                        }

                        setImageError(true);
                      }
                    }}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                    <Zap className="h-12 w-12 opacity-20" />
                    <span className="font-medium">
                      {imageError ? 'Failed to Load Image' : 'No Visual Data Available'}
                    </span>
                    {imageError && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImageError(false);
                        }}
                        className="rounded-full text-xs"
                      >
                        Retry Loading
                      </Button>
                    )}
                  </div>
                )}

                {/* Status Overlay */}
                <div className="absolute top-6 left-6 flex flex-col gap-2">
                  <Badge className="bg-black/60 backdrop-blur-xl border-white/10 text-white px-3 py-1.5 rounded-xl font-bold shadow-xl">
                    <Zap className="h-3 w-3 mr-1.5 text-yellow-400 fill-yellow-400" />
                    wNFT
                  </Badge>
                  {leaseStatus && (
                    <Badge
                      className={`${leaseStatus.timeRemaining > 0
                        ? 'bg-emerald-500/80'
                        : 'bg-destructive/80'
                        } backdrop-blur-xl border-white/10 text-white px-3 py-1.5 rounded-xl font-bold shadow-xl`}
                    >
                      {leaseStatus.timeRemaining > 0 ? 'Active Lease' : 'Lease Expired'}
                    </Badge>
                  )}
                </div>
              </div>

              <Card className="glass-card border-border/40 rounded-3xl overflow-hidden">
                <CardContent className="p-8">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    Description
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {metadata?.description || "No description provided for this asset."}
                  </p>

                  {metadata?.properties && metadata.properties.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-border/40">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Attributes</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {metadata.properties.map((prop: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 rounded-2xl bg-muted/30 border border-border/20 hover:border-primary/30 transition-colors group"
                          >
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 group-hover:text-primary/70 transition-colors">
                              {prop.trait_type || prop.type}
                            </div>
                            <div className="font-bold text-sm truncate">{prop.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Details & Actions */}
            <div className="lg:col-span-7 space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">
              {/* Lease Status Card */}
              <Card className="glass-card border-primary/20 rounded-3xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <Clock className="h-32 w-32" />
                </div>
                <CardContent className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Lease Timeline
                    </h3>
                    {leaseStatus && (
                      <div className={`px-4 py-1.5 rounded-full text-sm font-bold ${leaseStatus.timeRemaining > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'
                        }`}>
                        {leaseStatus.timeRemaining > 0 ? 'In Progress' : 'Completed'}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground font-medium mb-1">Time Remaining</p>
                        <p className="text-4xl font-black tracking-tight">
                          {leaseStatus ? formatTimeRemaining(leaseStatus.timeRemaining) : 'Calculating...'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground font-medium mb-1">Expiration Date</p>
                        <p className="font-bold">
                          {new Date(
                            dbWrapped?.validUntil
                              ? new Date(dbWrapped.validUntil).getTime()
                              : wrappedInfo.validUntil * 1000,
                          ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {leaseStatus && (
                      <div className="h-3 w-full bg-muted rounded-full overflow-hidden border border-border/40">
                        <div
                          className={`h-full transition-all duration-1000 ease-out rounded-full ${leaseStatus.timeRemaining > 0 ? 'bg-gradient-to-r from-primary to-purple-500' : 'bg-muted-foreground/20'
                            }`}
                          style={{ width: `${leaseStatus.timeRemaining > 0 ? Math.min(100, (leaseStatus.timeRemaining / (dbWrapped?.durationSeconds || 172800)) * 100) : 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Ownership & Contract Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass-card border-border/40 rounded-3xl">
                  <CardContent className="p-6 space-y-6">
                    <h3 className="font-bold flex items-center gap-2 text-primary/80">
                      <Shield className="h-4 w-4" />
                      Ownership
                    </h3>

                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">Primary Lease Holder</p>
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/20">
                        <span className="font-mono text-xs truncate mr-2 font-bold text-primary/90">
                          {rentalDetails?.renter ? `${rentalDetails.renter.slice(0, 12)}...${rentalDetails.renter.slice(-8)}` : 'Unknown'}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => rentalDetails?.renter && handleCopy(rentalDetails.renter)}>
                          {copiedAddress === rentalDetails?.renter ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      {address && rentalDetails?.renter && address.toLowerCase() === rentalDetails.renter.toLowerCase() && (
                        <p className="text-[10px] text-primary font-bold mt-1.5 ml-1">
                          {subLeaseDetails ? 'You have sub-leased this asset' : 'You currently hold this asset'}
                        </p>
                      )}
                    </div>

                    {subLeaseDetails && (
                      <div>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">Sub-renter</p>
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-500/5 border border-purple-500/20">
                          <span className="font-mono text-xs truncate mr-2 font-bold text-purple-700">
                            {`${subLeaseDetails.renter?.slice(0, 12)}...${subLeaseDetails.renter?.slice(-8)}`}
                          </span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => subLeaseDetails.renter && handleCopy(subLeaseDetails.renter)}>
                            {copiedAddress === subLeaseDetails.renter ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        {address && subLeaseDetails.renter && address.toLowerCase() === subLeaseDetails.renter.toLowerCase() && (
                          <p className="text-[10px] text-purple-600 font-bold mt-1.5 ml-1">You are the current sub-renter</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-card border-border/40 rounded-3xl">
                  <CardContent className="p-6 space-y-6">
                    <h3 className="font-bold flex items-center gap-2 text-primary/80">
                      <ExternalLink className="h-4 w-4" />
                      Contract Details
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">Original Contract</p>
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/20">
                          <span className="font-mono text-xs truncate mr-2">
                            {dbWrapped?.originalNftContract ? `${dbWrapped.originalNftContract.slice(0, 12)}...${dbWrapped.originalNftContract.slice(-8)}` : 'Unknown'}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => dbWrapped?.originalNftContract && handleCopy(dbWrapped.originalNftContract)}>
                              {copiedAddress === dbWrapped?.originalNftContract ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => window.open(`https://sepolia.etherscan.io/address/${dbWrapped?.originalNftContract}`, '_blank')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">Wrapped Contract</p>
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/20">
                          <span className="font-mono text-xs truncate mr-2">
                            {wrappedLeasingAddress ? `${wrappedLeasingAddress.slice(0, 12)}...${wrappedLeasingAddress.slice(-8)}` : 'Unknown'}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => wrappedLeasingAddress && handleCopy(wrappedLeasingAddress)}>
                              {copiedAddress === wrappedLeasingAddress ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => window.open(`https://sepolia.etherscan.io/address/${wrappedLeasingAddress}`, '_blank')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Rental Terms Card */}
              {rentalDetails && (
                <Card className="glass-card border-border/40 rounded-3xl overflow-hidden">
                  <CardContent className="p-8">
                    <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      Financial Terms (Primary Lease)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Total Rent</p>
                        <p className="text-xl font-black text-primary break-all">
                          {formatWeiToEth(rentalDetails.rentAmount)}
                          <span className="text-sm font-bold text-muted-foreground ml-1">ETH</span>
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Security Deposit</p>
                        <p className="text-xl font-black break-all">
                          {formatWeiToEth(rentalDetails.depositAmount)}
                          <span className="text-sm font-bold text-muted-foreground ml-1">ETH</span>
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Daily Rate</p>
                        <p className="text-xl font-black break-all">
                          {rentalDetails.pricePerSecond && rentalDetails.pricePerSecond !== '0'
                            ? formatWeiToEth((BigInt(rentalDetails.pricePerSecond) * 86400n).toString(), 8)
                            : wrappedInfo.pricePerSecond && wrappedInfo.pricePerSecond !== 0n
                              ? formatWeiToEth((wrappedInfo.pricePerSecond * 86400n).toString(), 8)
                              : '0'
                          }
                          <span className="text-sm font-bold text-muted-foreground ml-1">ETH</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border/20">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Duration</p>
                          <p className="font-bold">
                            {rentalDetails.rentDuration ? (
                              rentalDetails.rentDuration >= 86400
                                ? `${Math.round(rentalDetails.rentDuration / 86400)} Days`
                                : rentalDetails.rentDuration >= 3600
                                  ? `${Math.round(rentalDetails.rentDuration / 3600)} Hours`
                                  : `${Math.round(rentalDetails.rentDuration / 60)} Minutes`
                            ) : '0 Days'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border/20">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                          <Zap className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Renter Address</p>
                          <p className="font-mono text-xs font-bold">{rentalDetails.renter ? `${rentalDetails.renter.slice(0, 6)}...${rentalDetails.renter.slice(-4)}` : 'Unknown'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {rentalDetails.rentedAt && rentalDetails.rentDuration && (
                      <div className="mt-8">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Lease Progress</p>
                          <p className="text-xs font-bold text-primary">
                            {(() => {
                              const start = new Date(rentalDetails.rentedAt).getTime() / 1000;
                              const now = Date.now() / 1000;
                              const elapsed = Math.max(0, now - start);
                              const progress = Math.min(100, (elapsed / rentalDetails.rentDuration) * 100);
                              return progress.toFixed(1);
                            })()}%
                          </p>
                        </div>
                        <div className="w-full h-3 bg-muted rounded-full overflow-hidden border border-border/20">
                          <div
                            className="h-full bg-gradient-to-r from-primary to-blue-600 transition-all duration-1000"
                            style={{
                              width: `${(() => {
                                const start = new Date(rentalDetails.rentedAt).getTime() / 1000;
                                const now = Date.now() / 1000;
                                const elapsed = Math.max(0, now - start);
                                return Math.min(100, (elapsed / rentalDetails.rentDuration) * 100);
                              })()}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Sub-lease Terms Card */}
              {subLeaseDetails && (
                <Card className="glass-card border-purple-500/20 rounded-3xl overflow-hidden mt-6">
                  <CardContent className="p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <Zap className="h-5 w-5 text-purple-500" />
                        Sub-lease Information
                      </h3>
                      <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Currently Sub-leased</Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Sub-rent Price</p>
                        <p className="text-xl font-black text-purple-600 break-all">
                          {formatWeiToEth(subLeaseDetails.rentAmount)}
                          <span className="text-sm font-bold text-muted-foreground ml-1">ETH</span>
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Sub-renter</p>
                        <p className="text-lg font-bold font-mono truncate">
                          {subLeaseDetails.renter ? `${subLeaseDetails.renter.slice(0, 6)}...${subLeaseDetails.renter.slice(-4)}` : 'Unknown'}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Sub-lease Expiry</p>
                        <p className="text-lg font-bold">
                          {subLeaseDetails.expiresAt ? new Date(subLeaseDetails.expiresAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Sub-lease Progress Bar */}
                    {subLeaseDetails.rentedAt && subLeaseDetails.rentDuration && (
                      <div className="mt-8">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sub-lease Progress</p>
                          <p className="text-xs font-bold text-purple-600">
                            {(() => {
                              const start = new Date(subLeaseDetails.rentedAt).getTime() / 1000;
                              const now = Date.now() / 1000;
                              const elapsed = Math.max(0, now - start);
                              const progress = Math.min(100, (elapsed / subLeaseDetails.rentDuration) * 100);
                              return progress.toFixed(1);
                            })()}%
                          </p>
                        </div>
                        <div className="w-full h-3 bg-muted rounded-full overflow-hidden border border-border/20">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-1000"
                            style={{
                              width: `${(() => {
                                const start = new Date(subLeaseDetails.rentedAt).getTime() / 1000;
                                const now = Date.now() / 1000;
                                const elapsed = Math.max(0, now - start);
                                return Math.min(100, (elapsed / subLeaseDetails.rentDuration) * 100);
                              })()}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Activity Section */}
        {!loading && wrappedInfo && (
          <div className="mt-20 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black tracking-tight italic">
                Activity <span className="text-primary text-4xl">.</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground hover:text-primary gap-2"
                onClick={() => {
                  if (dbWrapped?.originalNftContract && dbWrapped?.originalTokenId) {
                    const fetchActivities = async () => {
                      setLoadingActivities(true);
                      try {
                        const nftRes = await fetch(apiUrl(`/nfts/external/${dbWrapped.originalNftContract}/${dbWrapped.originalTokenId}`));
                        const nftData = await nftRes.json();
                        if (nftData.success && nftData.data) {
                          const actualId = nftData.data._id || nftData.data.id.replace('local_', '');
                          const actRes = await fetch(apiUrl(`/activities?nft=${actualId}&limit=10`));
                          const actData = await actRes.json();
                          if (actData.success) setActivities(actData.data);
                        }
                      } catch (e) { console.error(e); } finally { setLoadingActivities(false); }
                    };
                    fetchActivities();
                  }
                }}
                disabled={loadingActivities}
              >
                <RefreshCw className={`h-4 w-4 ${loadingActivities ? 'animate-spin' : ''}`} />
                Refresh History
              </Button>
            </div>

            <Card className="glass-card border-border/40 rounded-3xl overflow-hidden shadow-2xl">
              <CardContent className="p-0">
                {loadingActivities && activities.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Loading history...</p>
                  </div>
                ) : activities.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
                    <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20" />
                    <p className="text-muted-foreground font-bold italic">No activity recorded for this asset yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {activities.map((act, index) => {
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
                        <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-4 p-6 hover:bg-primary/5 transition-colors duration-300">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center border border-border/20 shadow-sm group-hover:border-primary/30 transition-colors">
                              {getActivityIcon(act.type)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-foreground">{getActivityLabel(act.type)}</span>
                                {act.price && <Badge variant="secondary" className="font-mono text-[10px] font-black border-primary/20 text-primary">{act.price} ETH</Badge>}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                <span className="truncate max-w-[120px] transition-colors hover:text-primary cursor-help" title={act.from_address}>
                                  From {act.from?.name || act.from_address?.slice(0, 6) || 'Unknown'}
                                </span>
                                <ArrowRight className="h-3 w-3 opacity-30" />
                                <span className="truncate max-w-[120px] transition-colors hover:text-primary cursor-help" title={act.to_address}>
                                  To {act.to?.name || act.to_address?.slice(0, 6) || 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1">
                            <div className="text-sm font-black text-foreground italic">{act.time_ago}</div>
                            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                              {act.timestamp ? new Date(act.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            </div>
                          </div>

                          {act.transaction_hash && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full ml-2 hidden sm:flex"
                              onClick={() => window.open(`https://sepolia.etherscan.io/tx/${act.transaction_hash}`, '_blank')}
                            >
                              <ExternalLink className="h-3.5 w-3.5 opacity-40 hover:opacity-100" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main >
      <CollateralLeasingSidebar
        open={showSubLeaseSidebar}
        onOpenChange={setShowSubLeaseSidebar}
        initialContractAddress={wrappedLeasingAddress}
        initialTokenId={wId}
        initialLeasingType="marketplace"
      />
      <Footer />
    </div >
  );
};

export default WrappedNFTDetails;
