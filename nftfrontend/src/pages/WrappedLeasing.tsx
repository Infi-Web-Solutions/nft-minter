import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, Gift, Package, Clock, CheckCircle2, AlertCircle, Info
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { wrappedLeasingService } from '@/services/wrappedLeasingService';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface WrappedNFT {
  wId: string;
  originalNft: string;
  originalTokenId: string;
  owner: string;
  validUntil: number;
  active: boolean;
  isActive?: boolean;
  timeRemaining?: number;
}

const WrappedLeasing = () => {
  const { isConnected, address } = useWallet();
  const [activeTab, setActiveTab] = useState<'wrap' | 'manage'>('wrap');
  
  // Wrap form state
  const [nftContract, setNftContract] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [renterAddress, setRenterAddress] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [wrapping, setWrapping] = useState(false);
  
  // Manage state
  const [wrappedNFTs, setWrappedNFTs] = useState<WrappedNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchWId, setSearchWId] = useState('');

  useEffect(() => {
    if (isConnected && address && window.ethereum) {
      initializeService();
    }
  }, [isConnected, address]);

  const initializeService = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      await wrappedLeasingService.initialize(provider, signer);
      await loadWrappedNFTs();
    } catch (error) {
      console.error('Error initializing service:', error);
    }
  };

  const loadWrappedNFTs = async () => {
    setLoading(true);
    try {
      const counter = await wrappedLeasingService.getWCounter();
      const nfts: WrappedNFT[] = [];
      
      // Load last 20 wrapped NFTs for demo (you can optimize this)
     const start = Math.max(1, counter - 19);
      for (let i = counter; i >= start; i--) {
        try {
          const info = await wrappedLeasingService.getWrappedInfo(i.toString());
          const status = await wrappedLeasingService.getLeaseStatus(i.toString());
          
          // Only show NFTs owned by current user
          if (info.owner.toLowerCase() === address?.toLowerCase()) {
            nfts.push({
              wId: i.toString(),
              ...info,
              ...status
            });
          }
        } catch (error) {
          // Skip if NFT doesn't exist
          continue;
        }
      }
      
      setWrappedNFTs(nfts);
    } catch (error) {
      console.error('Error loading wrapped NFTs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWrapNFT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nftContract || !tokenId || !renterAddress || !durationDays) {
      toast.error('Please fill all fields');
      return;
    }

    setWrapping(true);
    try {
      // Step 1: Approve NFT
      toast.info('Approving NFT for wrapping...');
      await wrappedLeasingService.approveNFTForWrapping(nftContract, tokenId);

      // Step 2: Wrap the NFT
      toast.info('Wrapping NFT...');
      const result = await wrappedLeasingService.wrapNFT(
        nftContract,
        tokenId,
        renterAddress,
        parseInt(durationDays),
        '', // metadata URI empty for now
        '0' // fee - should calculate from contract
      );

      toast.success(`NFT Wrapped Successfully! wID: ${result.wId}`);
      
      // Reset form
      setNftContract('');
      setTokenId('');
      setRenterAddress('');
      setDurationDays('30');
      
      // Refresh list
      await loadWrappedNFTs();
      setActiveTab('manage');
    } catch (error: any) {
      console.error('Error wrapping NFT:', error);
      toast.error(error.message || 'Failed to wrap NFT');
    } finally {
      setWrapping(false);
    }
  };

  const handleUnwrapNFT = async (wId: string) => {
    if (!window.confirm('Are you sure you want to unwrap this NFT?')) return;

    try {
      toast.info('Unwrapping NFT...');
      await wrappedLeasingService.unwrapNFT(wId);
      toast.success('NFT Unwrapped Successfully!');
      await loadWrappedNFTs();
    } catch (error: any) {
      console.error('Error unwrapping NFT:', error);
      toast.error(error.message || 'Failed to unwrap NFT');
    }
  };

  const handleSearchWId = async () => {
    if (!searchWId) return;

    setLoading(true);
    try {
      const info = await wrappedLeasingService.getWrappedInfo(searchWId);
      const status = await wrappedLeasingService.getLeaseStatus(searchWId);
      
      setWrappedNFTs([{
        wId: searchWId,
        ...info,
        ...status
      }]);
    } catch (error) {
      toast.error('Wrapped NFT not found');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-20">
            <Gift className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground">
              Please connect your wallet to use Wrapped Leasing
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2 flex items-center gap-3">
            <Gift className="h-10 w-10" />
            Wrapped Leasing
          </h1>
          <p className="text-muted-foreground">
            Wrap your NFTs into time-limited leases and lend them safely
          </p>
        </div>

        {/* Info Banner */}
        <Card className="mb-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-purple-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">How Wrapped Leasing Works</h3>
                <p className="text-sm text-muted-foreground">
                  Wrap your NFT into a time-limited wrapped NFT (wNFT). The renter receives the wNFT 
                  for a specified duration. After the lease expires, you can unwrap to get your original NFT back. 
                  The wNFT cannot be transferred after expiry, ensuring your asset returns to you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="wrap">Wrap NFT</TabsTrigger>
            <TabsTrigger value="manage">My Wrapped NFTs</TabsTrigger>
          </TabsList>

          {/* Wrap Tab */}
          <TabsContent value="wrap">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Wrap Your NFT
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleWrapNFT} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="nftContract">NFT Contract Address *</Label>
                      <Input
                        id="nftContract"
                        placeholder="0x..."
                        value={nftContract}
                        onChange={(e) => setNftContract(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        The contract address of your NFT
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tokenId">Token ID *</Label>
                      <Input
                        id="tokenId"
                        placeholder="123"
                        value={tokenId}
                        onChange={(e) => setTokenId(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        The token ID of your NFT
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="renterAddress">Renter Address *</Label>
                      <Input
                        id="renterAddress"
                        placeholder="0x..."
                        value={renterAddress}
                        onChange={(e) => setRenterAddress(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Who will receive the wrapped NFT
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="duration">Lease Duration (Days) *</Label>
                      <Input
                        id="duration"
                        type="number"
                        min="0.0001"
                        step="any"
                        placeholder="30 (or 0.0014 for 2 min test)"
                        value={durationDays}
                        onChange={(e) => setDurationDays(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        How long the lease will last (use 0.0014 for 2-minute test)
                      </p>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                    <h4 className="font-semibold text-sm">Summary:</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Your NFT will be locked in the contract</li>
                      <li>• Renter receives a time-limited wrapped NFT</li>
                      <li>• Lease expires in {durationDays || '0'} days</li>
                      <li>• You can unwrap after expiry to get your NFT back</li>
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={wrapping}
                  >
                    {wrapping ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Wrapping NFT...
                      </>
                    ) : (
                      <>
                        <Package className="h-4 w-4 mr-2" />
                        Wrap NFT
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manage Tab */}
          <TabsContent value="manage">
            <Card className="glass-card mb-6">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by Wrapped ID (wId)..."
                    value={searchWId}
                    onChange={(e) => setSearchWId(e.target.value)}
                  />
                  <Button onClick={handleSearchWId} disabled={loading}>
                    Search
                  </Button>
                  <Button variant="outline" onClick={loadWrappedNFTs} disabled={loading}>
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : wrappedNFTs.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="p-12 text-center">
                  <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Wrapped NFTs Found</h3>
                  <p className="text-muted-foreground">
                    You haven't wrapped any NFTs yet. Go to the Wrap tab to create your first wrapped lease!
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {wrappedNFTs.map((nft) => (
                  <Card key={nft.wId} className="glass-card hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">wNFT #{nft.wId}</CardTitle>
                        {nft.active ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Original NFT:</span>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            #{nft.originalTokenId}
                          </code>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Contract:</span>
                          <code className="bg-muted px-2 py-1 rounded truncate max-w-[200px]">
                            {nft.originalNft.slice(0, 6)}...{nft.originalNft.slice(-4)}
                          </code>
                        </div>
                      </div>

                      <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-purple-500" />
                          <span className="font-medium">
                            {nft.timeRemaining !== undefined
                              ? formatTimeRemaining(nft.timeRemaining)
                              : 'Calculating...'}
                          </span>
                        </div>
                        {nft.validUntil && (
                          <div className="text-xs text-muted-foreground">
                            Expires: {new Date(nft.validUntil * 1000).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Owner:</span>
                          <code className="bg-muted px-2 py-1 rounded">
                            {nft.owner.slice(0, 6)}...{nft.owner.slice(-4)}
                          </code>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          {nft.isActive !== undefined && (
                            <span className="font-medium">
                              {nft.isActive ? '✓ Active Lease' : '✗ Inactive'}
                            </span>
                          )}
                        </div>
                      </div>

                      {nft.active && nft.owner.toLowerCase() === address?.toLowerCase() && (
                        <Button
                          className="w-full"
                          variant={nft.timeRemaining === 0 ? 'default' : 'outline'}
                          onClick={() => handleUnwrapNFT(nft.wId)}
                          disabled={nft.timeRemaining !== undefined && nft.timeRemaining > 0 && nft.isActive}
                        >
                          {nft.timeRemaining !== undefined && nft.timeRemaining > 0 ? (
                            <>
                              <AlertCircle className="h-4 w-4 mr-2" />
                              Cannot Unwrap Yet
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Unwrap NFT
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WrappedLeasing;
