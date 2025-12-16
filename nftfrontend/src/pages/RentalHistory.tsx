import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiUrl } from '@/config';
import { useWallet } from '@/contexts/WalletContext';
import { 
  FileText, 
  ExternalLink, 
  Clock, 
  User, 
  Wallet,
  TrendingUp,
  CalendarDays,
  RefreshCw,
  Search,
  Home,
  XCircle,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface RentalTransaction {
  id: string;
  type: 'Listed' | 'Rented' | 'Cancelled' | 'DepositRefunded' | 'Withdrawn';
  listingId: number;
  nftAddress: string;
  tokenId: string;
  owner: string;
  renter?: string;
  ownerShort?: string;
  renterShort?: string;
  rentAmountETH?: string;
  depositAmountETH?: string;
  pricePerDayETH?: string;
  minDays?: number;
  maxDays?: number;
  expiresAt?: string;
  wrappedTokenId?: number;
  transactionHash?: string;
  blockNumber?: number;
  createdAt: string;
}

interface TransactionStats {
  totalListings: number;
  totalRentals: number;
  totalCancelled: number;
}

const RentalHistory = () => {
  const { address } = useWallet();
  const [transactions, setTransactions] = useState<RentalTransaction[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchAddress, setSearchAddress] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Fetch all transactions
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/rental-transactions'));
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      toast.error('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const res = await fetch(apiUrl('/rental-transactions/stats'));
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // Fetch my transactions
  const fetchMyTransactions = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/rental-transactions/user/${address}`));
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch my transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    if (activeTab === 'all') {
      fetchTransactions();
    } else if (activeTab === 'my' && address) {
      fetchMyTransactions();
    }
  }, [activeTab, address]);

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (searchAddress) {
      const lowerSearch = searchAddress.toLowerCase();
      return (
        tx.owner?.toLowerCase().includes(lowerSearch) ||
        tx.renter?.toLowerCase().includes(lowerSearch) ||
        tx.nftAddress?.toLowerCase().includes(lowerSearch) ||
        tx.tokenId?.includes(searchAddress)
      );
    }
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Listed': return <Home className="h-4 w-4 text-blue-500" />;
      case 'Rented': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'Cancelled': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'DepositRefunded': return <RefreshCw className="h-4 w-4 text-purple-500" />;
      case 'Withdrawn': return <ArrowUpRight className="h-4 w-4 text-orange-500" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      Listed: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
      Rented: 'bg-green-500/20 text-green-500 border-green-500/30',
      Cancelled: 'bg-red-500/20 text-red-500 border-red-500/30',
      DepositRefunded: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
      Withdrawn: 'bg-orange-500/20 text-orange-500 border-orange-500/30'
    };
    return variants[type] || 'bg-gray-500/20 text-gray-500';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return '-';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Rental Transaction History</h1>
            <p className="text-muted-foreground">Track all NFT rental activities on the marketplace</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => activeTab === 'all' ? fetchTransactions() : fetchMyTransactions()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Listings</p>
                    <p className="text-3xl font-bold text-blue-500">{stats.totalListings}</p>
                  </div>
                  <Home className="h-10 w-10 text-blue-500/50" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Rentals</p>
                    <p className="text-3xl font-bold text-green-500">{stats.totalRentals}</p>
                  </div>
                  <TrendingUp className="h-10 w-10 text-green-500/50" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Cancelled</p>
                    <p className="text-3xl font-bold text-red-500">{stats.totalCancelled}</p>
                  </div>
                  <XCircle className="h-10 w-10 text-red-500/50" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All Transactions</TabsTrigger>
            <TabsTrigger value="my" disabled={!address}>My Transactions</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by address or token ID..."
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Listed">Listed</SelectItem>
              <SelectItem value="Rented">Rented</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
              <SelectItem value="DepositRefunded">Deposit Refunded</SelectItem>
              <SelectItem value="Withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transactions List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">No transactions found</p>
            <p className="text-muted-foreground">
              {activeTab === 'my' 
                ? "You haven't made any rental transactions yet." 
                : "No rental transactions recorded yet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTransactions.map((tx) => (
              <Card key={tx.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Type and NFT info */}
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-full bg-muted/50">
                        {getTypeIcon(tx.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${getTypeBadge(tx.type)} border`}>
                            {tx.type}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Listing #{tx.listingId}
                          </span>
                        </div>
                        <div className="text-sm space-y-1">
                          {tx.nftAddress && tx.tokenId && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">NFT:</span>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {truncateAddress(tx.nftAddress)} #{tx.tokenId}
                              </code>
                            </div>
                          )}
                          {tx.owner && (
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Owner:</span>
                              <span className="font-mono text-xs">{tx.ownerShort || truncateAddress(tx.owner)}</span>
                            </div>
                          )}
                          {tx.renter && (
                            <div className="flex items-center gap-2">
                              <Wallet className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Renter:</span>
                              <span className="font-mono text-xs">{tx.renterShort || truncateAddress(tx.renter)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Financial info and date */}
                    <div className="text-right">
                      {tx.type === 'Listed' && tx.pricePerDayETH && (
                        <div className="mb-2">
                          <p className="text-sm text-muted-foreground">Price/Day</p>
                          <p className="font-bold text-blue-500">Ξ {parseFloat(tx.pricePerDayETH).toFixed(4)}</p>
                          {tx.minDays && tx.maxDays && (
                            <p className="text-xs text-muted-foreground">{tx.minDays}-{tx.maxDays} days</p>
                          )}
                        </div>
                      )}
                      {tx.type === 'Rented' && (
                        <div className="mb-2">
                          <p className="text-sm text-muted-foreground">Rent Paid</p>
                          <p className="font-bold text-green-500">Ξ {tx.rentAmountETH || '0'}</p>
                          {tx.depositAmountETH && (
                            <p className="text-xs text-muted-foreground">Deposit: Ξ {tx.depositAmountETH}</p>
                          )}
                          {tx.wrappedTokenId && (
                            <p className="text-xs text-purple-500">Wrapped ID: #{tx.wrappedTokenId}</p>
                          )}
                        </div>
                      )}
                      {tx.type === 'DepositRefunded' && tx.depositAmountETH && (
                        <div className="mb-2">
                          <p className="text-sm text-muted-foreground">Refunded</p>
                          <p className="font-bold text-purple-500">Ξ {tx.depositAmountETH}</p>
                        </div>
                      )}
                      {tx.type === 'Withdrawn' && tx.rentAmountETH && (
                        <div className="mb-2">
                          <p className="text-sm text-muted-foreground">Withdrawn</p>
                          <p className="font-bold text-orange-500">Ξ {tx.rentAmountETH}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(tx.createdAt)}</span>
                      </div>
                      {tx.transactionHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${tx.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          View on Etherscan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default RentalHistory;
