import React, { useEffect, useState } from 'react';
import { Clock, Gavel } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { web3Service } from '@/services/web3Service';
import { toast } from 'sonner';
import { apiUrl } from '@/config';

interface AuctionInfoProps {
    nft: any;
    onAuctionEnded?: () => void;
}

export const AuctionInfo: React.FC<AuctionInfoProps> = ({ nft, onAuctionEnded }) => {
    const [auctionListing, setAuctionListing] = useState<any>(null);
    const [timeRemaining, setTimeRemaining] = useState<string>('');
    const [isExpired, setIsExpired] = useState<boolean>(false);
    const [isEnding, setIsEnding] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [currentAddress, setCurrentAddress] = useState<string | null>(null);

    // Fetch auction listing from blockchain
    useEffect(() => {
        if (!nft || !nft.token_id || !(nft.is_auction || nft.isAuction)) {
            setLoading(false);
            return;
        }

        const fetchAuctionListing = async () => {
            try {
                setLoading(true);

                // Wait for web3Service to be initialized if needed
                let retries = 0;
                while (retries < 5) {
                    try {
                        const listing = await web3Service.getListing(Number(nft.token_id));
                        console.log('[AuctionInfo] Fetched listing:', listing);
                        setAuctionListing(listing);

                        try {
                            const signer = web3Service.getSigner();
                            if (signer) {
                                const address = await signer.getAddress();
                                setCurrentAddress(address);
                            }
                        } catch (addressError) {
                            console.error('[AuctionInfo] Failed to get current address:', addressError);
                        }

                        break;
                    } catch (e: any) {
                        if (e.message?.includes('initialized')) {
                            console.log('[AuctionInfo] Web3Service not initialized yet, retrying...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            retries++;
                        } else {
                            throw e;
                        }
                    }
                }
            } catch (error) {
                console.error('[AuctionInfo] Failed to fetch listing:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAuctionListing();
    }, [nft]);

    // Update countdown timer
    useEffect(() => {
        if (!auctionListing || !auctionListing.isAuction) return;

        const updateTimer = () => {
            const endTime = Number(auctionListing.auctionEndTime) * 1000; // Convert to milliseconds
            const now = Date.now();
            const diff = endTime - now;

            if (diff <= 0) {
                setTimeRemaining('Expired');
                setIsExpired(true);
                return;
            }

            setIsExpired(false);

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (days > 0) {
                setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
            } else if (hours > 0) {
                setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
            } else {
                setTimeRemaining(`${minutes}m ${seconds}s`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [auctionListing]);

    const handleEndAuction = async () => {
        if (!nft || !nft.token_id) return;

        try {
            setIsEnding(true);
            toast.loading('Ending auction...', { id: 'end-auction' });

            const tx = await web3Service.endAuction(Number(nft.token_id));
            toast.loading('Waiting for confirmation...', { id: 'end-auction' });

            const receipt = await web3Service.waitForTransaction(tx);
            console.log('[AuctionInfo] Auction ended:', receipt);

            // Update backend
            try {
                await fetch(apiUrl(`/nfts/${nft.token_id}/end-auction/`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transaction_hash: receipt?.hash || tx.hash,
                        winner: auctionListing?.highestBidder,
                        final_price: auctionListing?.highestBid
                    })
                });
            } catch (backendError) {
                console.error('[AuctionInfo] Backend update failed:', backendError);
            }

            toast.success('Auction ended successfully!', { id: 'end-auction' });

            if (onAuctionEnded) {
                onAuctionEnded();
            }
        } catch (error: any) {
            console.error('[AuctionInfo] Failed to end auction:', error);

            if (error?.code === 4001 || error?.message?.includes('user rejected')) {
                toast.error('Transaction cancelled', { id: 'end-auction' });
            } else {
                toast.error(error?.message || 'Failed to end auction', { id: 'end-auction' });
            }
        } finally {
            setIsEnding(false);
        }
    };

    // Don't render if not an auction
    if (!nft || !(nft.is_auction || nft.isAuction)) {
        return null;
    }

    if (loading) {
        return (
            <Card className="glass-card">
                <CardContent className="p-6 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-3 text-sm text-muted-foreground">Loading auction data...</span>
                </CardContent>
            </Card>
        );
    }

    if (!auctionListing) {
        return null;
    }

    const hasHighestBid = auctionListing.highestBid && auctionListing.highestBid !== '0.0';

    return (
        <Card className="glass-card">
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <Gavel className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Auction Details</h3>
                </div>

                {/* Auction Status */}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={isExpired ? "destructive" : "default"}>
                        {isExpired ? 'Expired' : 'Active'}
                    </Badge>
                </div>

                {/* Time Remaining */}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Time Remaining</span>
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span className={`font-semibold ${isExpired ? 'text-destructive' : 'text-primary'}`}>
                            {timeRemaining}
                        </span>
                    </div>
                </div>

                {/* Starting Price */}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Starting Price</span>
                    <span className="font-semibold">Ξ{auctionListing.startingPrice}</span>
                </div>

                {/* Highest Bid */}
                {hasHighestBid && (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Highest Bid</span>
                            <span className="font-semibold text-green-500">Ξ{auctionListing.highestBid}</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Highest Bidder</span>
                            <span className="text-xs font-mono">
                                {auctionListing.highestBidder.slice(0, 6)}...{auctionListing.highestBidder.slice(-4)}
                            </span>
                        </div>
                    </>
                )}

                {/* End Auction Button */}
                {isExpired && auctionListing.isActive && (
                    (currentAddress?.toLowerCase() === auctionListing.seller.toLowerCase() ||
                        currentAddress?.toLowerCase() === auctionListing.highestBidder.toLowerCase()) ? (
                        <Button
                            onClick={handleEndAuction}
                            disabled={isEnding}
                            className="w-full bg-gradient-to-r from-purple-500 to-blue-600"
                        >
                            {isEnding ? 'Ending Auction...' : 'End Auction'}
                        </Button>
                    ) : (
                        <p className="text-xs text-amber-500 text-center bg-amber-500/10 py-2 rounded">
                            Waiting for the owner or highest bidder to end the auction.
                        </p>
                    )
                )}

                {/* Info Message */}
                {isExpired && !hasHighestBid && (
                    <p className="text-xs text-muted-foreground text-center">
                        No bids were placed. Click "End Auction" to close the listing.
                    </p>
                )}

                {isExpired && hasHighestBid && (
                    <p className="text-xs text-muted-foreground text-center">
                        Auction has ended. Click "End Auction" to transfer NFT to the winner.
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
