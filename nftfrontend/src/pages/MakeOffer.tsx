
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Wallet, Clock, User, ShieldCheck, Info } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiUrl, mediaUrl } from '@/config';
import { web3Service } from '@/services/web3Service';
import WalletGuard from '@/components/WalletGuard';

const MakeOffer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { address, balance } = useWallet();
    const [nft, setNFT] = useState<any>(null);
    const [owner, setOwner] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [offerAmount, setOfferAmount] = useState('');
    const [expirationDuration, setExpirationDuration] = useState('1'); // Days

    // Helper function to serialize BigInt values
    const serializeBigInt = (obj: any): any => {
        if (typeof obj === 'bigint') {
            return Number(obj);
        }
        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                return obj.map(serializeBigInt);
            }
            return Object.keys(obj).reduce((acc, key) => {
                acc[key] = serializeBigInt(obj[key]);
                return acc;
            }, {} as any);
        }
        return obj;
    };

    useEffect(() => {
        if (!id) return;

        const fetchNFT = async () => {
            setLoading(true);
            try {
                // Fetch NFT details
                const res = await fetch(apiUrl(`/nfts/combined/${id}/`));
                const data = await res.json();

                if (data.success) {
                    setNFT(data.data);

                    // Fetch owner details if available
                    if (data.data.owner_address) {
                        try {
                            const ownerRes = await fetch(apiUrl(`/profiles/${data.data.owner_address}/`));
                            const ownerData = await ownerRes.json();
                            if (ownerData.success) {
                                setOwner(ownerData.data);
                            } else {
                                // Fallback if profile not found
                                setOwner({
                                    username: `User ${data.data.owner_address.slice(0, 6)}`,
                                    address: data.data.owner_address
                                });
                            }
                        } catch (err) {
                            console.error('Error fetching owner:', err);
                            setOwner({
                                username: `User ${data.data.owner_address.slice(0, 6)}`,
                                address: data.data.owner_address
                            });
                        }
                    }
                } else {
                    toast.error(data.error || 'NFT not found');
                    navigate('/');
                }
            } catch (e) {
                console.error('Error fetching NFT:', e);
                toast.error('Failed to load NFT details');
                navigate('/');
            } finally {
                setLoading(false);
            }
        };

        fetchNFT();
    }, [id, navigate]);

    const handleMakeOffer = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!address) {
            toast.error('Please connect your wallet');
            return;
        }

        // Prevent owner from bidding on their own auction
        try {
            if (nft && nft.owner_address && address && nft.owner_address.toLowerCase() === address.toLowerCase()) {
                toast.error('You cannot place a bid or offer on your own NFT');
                return;
            }
        } catch (err) {
            // ignore comparison errors
        }

        if (!offerAmount || parseFloat(offerAmount) <= 0) {
            toast.error('Please enter a valid offer amount');
            return;
        }

        try {
            setIsSubmitting(true);

            // Check if it's an auction
            if (nft.is_auction) {
                toast.loading('Placing bid...', { id: 'offer' });

                // Call smart contract to place bid
                const tokenId = parseInt(nft.token_id);
                const tx = await web3Service.placeBid(tokenId, offerAmount);

                toast.loading('Confirming transaction...', { id: 'offer' });
                const receipt = await web3Service.waitForTransaction(tx);

                toast.success('Bid placed on-chain!', { id: 'offer' });

                // After the on-chain bid is confirmed, record the bid in the backend so it is visible to all users
                try {
                    const txHash = receipt?.hash || tx.hash;
                    console.log('[DEBUG] Placed bid on-chain, txHash:', txHash);
                    console.log('[DEBUG] Receipt:', receipt);

                    const offerData = {
                        from_address: address,
                        price: parseFloat(offerAmount),
                        transaction_hash: txHash,
                        block_number: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
                        gas_used: receipt?.gasUsed ? Number(receipt.gasUsed) : null,
                        gas_price: null
                    };

                    // Ensure all values are JSON serializable
                    const serializedOfferData = serializeBigInt(offerData);

                    console.log('[DEBUG] Sending bid to backend:', serializedOfferData);
                    const res = await fetch(apiUrl(`/nfts/${id}/offers/create/`), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(serializedOfferData)
                    });

                    console.log('[DEBUG] Backend response status:', res.status);
                    const result = await res.json();
                    console.log('[DEBUG] Backend response body:', result);

                    if (result.success) {
                        toast.success('Bid recorded on marketplace!', { id: 'offer' });
                    } else {
                        console.warn('Backend did not record bid:', result);
                        toast.error(result.error || 'Bid recorded on-chain but failed to save to backend', { id: 'offer' });
                    }
                } catch (err: any) {
                    console.error('Error recording bid to backend:', err);
                    toast.error('Bid placed on-chain but failed to record on backend', { id: 'offer' });
                }

                setTimeout(() => {
                    navigate(`/nft/${id}`);
                }, 2000);
            } else {
                // Make offer on fixed price/unlisted item via API
                toast.loading('Submitting offer...', { id: 'offer' });

                const offerData = {
                    from_address: address,
                    price: parseFloat(offerAmount)
                };

                console.log('[DEBUG] Making offer with ID:', id);
                console.log('[DEBUG] Offer data:', offerData);

                const res = await fetch(apiUrl(`/nfts/${id}/offers/create/`), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(offerData)
                });

                console.log('[DEBUG] Offer response status:', res.status);
                const result = await res.json();
                console.log('[DEBUG] Offer response:', result);

                if (result.success) {
                    toast.success('Offer submitted successfully!', { id: 'offer' });

                    setTimeout(() => {
                        navigate(`/nft/${id}`);
                    }, 2000);
                } else {
                    throw new Error(result.error || 'Failed to submit offer');
                }
            }

        } catch (error: any) {
            console.error('Error making offer:', error);
            toast.error(error.message || 'Failed to submit offer', { id: 'offer' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col bg-background">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                        <p className="text-muted-foreground animate-pulse">Loading NFT details...</p>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    if (!nft) return null;

    const getProfileImageUrl = (profile: any) => {
        if (!profile) return '';
        const url = profile.avatar_url || profile.profile_image || '';
        if (!url) return `https://api.dicebear.com/7.x/identicon/svg?seed=${profile.address || 'user'}`;
        return mediaUrl(url);
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />

            <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
                <Button
                    variant="ghost"
                    onClick={() => navigate(-1)}
                    className="mb-8 hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to NFT
                </Button>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                    {/* Left Column: NFT Preview */}
                    <div className="lg:col-span-5 space-y-6">
                        <Card className="overflow-hidden border-0 shadow-2xl bg-card/50 backdrop-blur-sm ring-1 ring-white/10">
                            <div className="aspect-square relative group">
                                <img
                                    src={nft.image_url ? mediaUrl(nft.image_url) : '/placeholder.png'}
                                    alt={nft.name}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    onError={(e) => {
                                        e.currentTarget.src = 'https://via.placeholder.com/400?text=NFT+Image';
                                    }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </div>
                            <CardContent className="p-6 space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                            {typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                                        </Badge>
                                        {nft.is_auction && (
                                            <Badge variant="outline" className="border-orange-500/50 text-orange-500">
                                                <Clock className="w-3 h-3 mr-1" /> Auction
                                            </Badge>
                                        )}
                                    </div>
                                    <h2 className="text-2xl font-bold tracking-tight">{nft.name}</h2>
                                </div>

                                <Separator className="bg-border/50" />

                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground font-medium">Current Price</span>
                                    <div className="text-right">
                                        <span className="text-xl font-bold block">
                                            {nft.price ? `${nft.price} ETH` : 'Not Listed'}
                                        </span>
                                        {nft.price && <span className="text-xs text-muted-foreground">≈ ${(parseFloat(nft.price) * 3500).toLocaleString()}</span>}
                                    </div>
                                </div>

                                {owner && (
                                    <div className="pt-2">
                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 block">Owned by</span>
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/profile/${owner.address || nft.owner_address}`)}>
                                            <Avatar className="h-10 w-10 ring-2 ring-background">
                                                <AvatarImage src={getProfileImageUrl(owner)} />
                                                <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-semibold leading-none">{owner.username || 'Unknown User'}</p>
                                                <p className="text-xs text-muted-foreground mt-1 font-mono">
                                                    {owner.address ? `${owner.address.slice(0, 6)}...${owner.address.slice(-4)}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Offer Form */}
                    <div className="lg:col-span-7">
                        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm ring-1 ring-white/10 h-full">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-3xl font-bold">Make an Offer</CardTitle>
                                <CardDescription className="text-base">
                                    You are about to make an offer for <span className="font-semibold text-foreground">{nft.name}</span>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <WalletGuard>
                                    <form onSubmit={handleMakeOffer} className="space-y-8">

                                        <div className="grid gap-6">
                                            <div className="space-y-3">
                                                <Label htmlFor="amount" className="text-base font-medium">Offer Amount</Label>
                                                <div className="relative group">
                                                    <Input
                                                        id="amount"
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        placeholder="0.00"
                                                        value={offerAmount}
                                                        onChange={(e) => setOfferAmount(e.target.value)}
                                                        className="pl-12 h-14 text-lg font-medium transition-all border-muted-foreground/20 focus:border-primary/50 focus:ring-primary/20"
                                                        required
                                                    />
                                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                                                        <span className="text-lg">Ξ</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">Available Balance</span>
                                                    <span className="font-medium font-mono">
                                                        {balance ? `${parseFloat(balance).toFixed(4)} ETH` : (
                                                            <span className="flex items-center gap-1 text-muted-foreground">
                                                                <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <Label htmlFor="expiration" className="text-base font-medium">Offer Expiration</Label>
                                                <Select
                                                    value={expirationDuration}
                                                    onValueChange={setExpirationDuration}
                                                >
                                                    <SelectTrigger id="expiration" className="h-12 text-base border-muted-foreground/20">
                                                        <SelectValue placeholder="Select duration" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">1 Day</SelectItem>
                                                        <SelectItem value="3">3 Days</SelectItem>
                                                        <SelectItem value="7">7 Days</SelectItem>
                                                        <SelectItem value="30">1 Month</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Info className="h-3 w-3" />
                                                    Your offer will automatically expire after this duration.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-muted/30 p-6 rounded-xl space-y-3 border border-border/50">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Offer Balance</span>
                                                <span className="font-medium">{offerAmount || '0'} ETH</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Network Fee (Est.)</span>
                                                <span className="font-medium">~0.003 ETH</span>
                                            </div>
                                            <Separator className="bg-border/50 my-2" />
                                            <div className="flex justify-between items-end">
                                                <span className="font-bold text-lg">Total</span>
                                                <div className="text-right">
                                                    <span className="font-bold text-xl block">{offerAmount || '0'} ETH</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {offerAmount ? `≈ $${(parseFloat(offerAmount) * 3500).toLocaleString()}` : '$0.00'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <Button
                                                type="submit"
                                                className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
                                                size="lg"
                                                disabled={isSubmitting || !offerAmount || (address && nft && nft.owner_address && address.toLowerCase() === nft.owner_address.toLowerCase())}
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                        Submitting Offer...
                                                    </>
                                                ) : (
                                                    'Make Offer'
                                                )}
                                            </Button>

                                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                                <ShieldCheck className="h-3 w-3" />
                                                <span>Secure transaction powered by Ethereum</span>
                                            </div>
                                        </div>
                                    </form>
                                </WalletGuard>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default MakeOffer;
