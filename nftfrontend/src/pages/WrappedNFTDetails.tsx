import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, ArrowLeft, ExternalLink, DollarSign } from 'lucide-react';
import { wrappedLeasingApiService } from '@/services/wrappedLeasingApiService';
import { apiUrl } from '@/config';
import { useWallet } from '@/contexts/WalletContext';

interface WrappedInfo {
  originalNft: string;
  originalTokenId: string;
  // Current holder of the wNFT (may be renter or original owner)
  owner: string;
  // Original owner who wrapped the NFT (from contract)
  originalOwner?: string;
  validUntil: number;
  active: boolean;
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
}

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
          }
          if (wrappedDb?.status) {
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
            });
          }
        }

        // 2) Try to load metadata for the original NFT via existing backend endpoint.
        // Prefer DB values for original contract/token (they are always set),
        // and fall back to on-chain values only if DB is missing.
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
            const res = await fetch(
              apiUrl(`/nfts/external/${originalContract}/${originalTokenId}`),
            );
            const data = await res.json();
            if (data.success && data.data) {
              setMetadata(data.data);
            }
          } catch {
            // Metadata is optional; ignore failures here
          }
        }
      } catch (e: any) {
        console.error('Failed to load wrapped NFT details', e);
        setError(e?.message || 'Failed to load wrapped NFT details');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [wId]);

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Derive image URL from multiple possible metadata shapes:
  // - Internal NFT document: image_url
  // - On-chain metadata JSON: image or image_url
  // - Fallback: token_uri if it looks like a direct media link
  let rawImage: string | undefined;
  const metaAny = metadata as any;
  if (metaAny?.image_url) {
    rawImage = metaAny.image_url as string;
  } else if (metaAny?.image) {
    rawImage = metaAny.image as string;
  } else if (typeof metaAny?.token_uri === 'string') {
    const uri = metaAny.token_uri as string;
    if (uri.startsWith('ipfs://') || uri.startsWith('http')) {
      rawImage = uri;
    }
  }

  const imageUrl = rawImage
    ? rawImage.startsWith('ipfs://')
      ? rawImage.replace('ipfs://', 'https://ipfs.io/ipfs/')
      : rawImage
    : undefined;

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
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold gradient-text">
              Wrapped NFT #{wId}
            </h1>
            <p className="text-muted-foreground text-sm">
              View lease status and original NFT details for this wrapped rental.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border-red-500/40 bg-red-500/10">
            <CardContent className="py-8 text-center">
              <p className="text-red-500 font-semibold mb-2">
                Failed to load wrapped NFT
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        ) : !wrappedInfo ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Wrapped NFT not found on-chain.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="overflow-hidden glass-card">
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={metadata?.name || `Wrapped NFT #${wId}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground">No Image</span>
                )}
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-purple-500/10 text-purple-300">
                    wNFT
                  </Badge>
                  {isCurrentHolder && (
                    <Badge className="bg-emerald-500/10 text-emerald-300">
                      You are the current holder
                    </Badge>
                  )}
                  {!isCurrentHolder && currentHolder && (
                    <Badge className="bg-slate-500/10 text-slate-200">
                      Held by&nbsp;
                      {currentHolder.slice(0, 6)}...
                      {currentHolder.slice(-4)}
                    </Badge>
                  )}
                  {leaseStatus && (
                    <Badge
                      className={
                        leaseStatus.timeRemaining > 0
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-red-500/10 text-red-400'
                      }
                    >
                      {leaseStatus.timeRemaining > 0 ? 'Active Lease' : 'Expired'}
                    </Badge>
                  )}
                  {dbStatus && (
                    <Badge className="bg-blue-500/10 text-blue-300">
                      DB: {dbStatus}
                    </Badge>
                  )}
                </div>
                <h2 className="text-xl font-semibold">
                  {metadata?.name || `Wrapped NFT #${wId}`}
                </h2>
                {metadata?.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {metadata.description}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Lease Status
                    </span>
                    {leaseStatus && (
                      <span className="text-sm font-medium">
                        {formatTimeRemaining(leaseStatus.timeRemaining)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">Original NFT</div>
                      <div className="font-mono text-xs break-all">
                        {dbWrapped?.originalNftContract || wrappedInfo.originalNft}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 h-7 w-7"
                        onClick={() =>
                          window.open(
                              `https://sepolia.etherscan.io/address/${
                                dbWrapped?.originalNftContract || wrappedInfo.originalNft
                              }`,
                            '_blank',
                          )
                        }
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Token ID</div>
                      <div className="font-semibold">
                        #{dbWrapped?.originalTokenId || wrappedInfo.originalTokenId}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Original Owner</div>
                      <div className="font-mono text-xs break-all">
                        {originalOwner || 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Current Holder</div>
                      <div className="font-mono text-xs break-all">
                        {currentHolder || 'Unknown'}
                      </div>
                    </div>
                    {(dbWrapped?.validUntil || wrappedInfo.validUntil) && (
                      <div>
                        <div className="text-muted-foreground">Valid Until</div>
                        <div className="text-sm">
                          {new Date(
                            dbWrapped?.validUntil
                              ? new Date(dbWrapped.validUntil).getTime()
                              : wrappedInfo.validUntil * 1000,
                          ).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {rentalDetails && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Rental Terms
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {rentalDetails.renter && (
                        <div>
                          <div className="text-muted-foreground">Renter</div>
                          <div className="font-mono text-xs break-all">
                            {rentalDetails.renter}
                          </div>
                        </div>
                      )}
                      {rentalDetails.rentAmount && (
                        <div>
                          <div className="text-muted-foreground">Rent Amount (wei)</div>
                          <div className="font-semibold">{rentalDetails.rentAmount}</div>
                        </div>
                      )}
                      {rentalDetails.depositAmount && (
                        <div>
                          <div className="text-muted-foreground">Deposit (wei)</div>
                          <div className="font-semibold">
                            {rentalDetails.depositAmount}
                          </div>
                        </div>
                      )}
                      {rentalDetails.pricePerSecond && (
                        <div>
                          <div className="text-muted-foreground">Price / Second (wei)</div>
                          <div className="font-semibold">
                            {rentalDetails.pricePerSecond}
                          </div>
                        </div>
                      )}
                      {typeof rentalDetails.rentDuration === 'number' && (
                        <div>
                          <div className="text-muted-foreground">Rent Duration</div>
                          <div className="font-semibold">
                            {Math.round(rentalDetails.rentDuration / 86400)} days
                          </div>
                        </div>
                      )}
                      {rentalDetails.expiresAt && (
                        <div>
                          <div className="text-muted-foreground">Rental Expires At</div>
                          <div className="text-sm">
                            {new Date(rentalDetails.expiresAt).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {metadata?.properties && metadata.properties.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Attributes</h3>
                    <div className="flex flex-wrap gap-2">
                      {metadata.properties.map((prop: any, idx: number) => (
                        <div
                          key={idx}
                          className="px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-xs"
                        >
                          <div className="text-muted-foreground">
                            {prop.trait_type || prop.type}
                          </div>
                          <div className="font-semibold">{prop.value}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default WrappedNFTDetails;


