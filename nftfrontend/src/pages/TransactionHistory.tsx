import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, FileText
} from 'lucide-react';
import { apiUrl } from '@/config';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Loan {
  _id: string;
  loanId: number;
  nftContract: string;
  tokenId: string;
  borrower: string;
  lender: string | null;
  principal: string;
  interestBps: number;
  duration: number;
  status: string;
  startTime: number;
  createdAt: string;
}

const TransactionHistory = () => {
  const { isConnected, address } = useWallet();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loanFilter, setLoanFilter] = useState<string>('all');

  useEffect(() => {
    if (isConnected && address) {
      fetchLoans();
    } else {
      setLoans([]);
      setLoading(false);
    }
  }, [isConnected, address, loanFilter]);

  const fetchLoans = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/loans/user/${address}`));
      const data = await res.json();
      
      if (data.success) {
        let filteredLoans = data.data;
        
        // Apply status filter
        if (loanFilter !== 'all') {
          filteredLoans = filteredLoans.filter((loan: Loan) => 
            loan.status.toLowerCase() === loanFilter.toLowerCase()
          );
        }
        
        setLoans(filteredLoans);
      }
    } catch (error) {
      console.error('Error fetching loans:', error);
      toast.error('Failed to load loan history');
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
            <p className="text-muted-foreground">
              Please connect your wallet to view your loan history
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
          <h1 className="text-4xl font-bold gradient-text mb-2">Loan History</h1>
          <p className="text-muted-foreground">
            View all your loan transactions - created, funded, repaid, and liquidated
          </p>
        </div>

        {/* Loan Status Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <Tabs value={loanFilter} onValueChange={setLoanFilter} className="w-full">
              <TabsList className="grid grid-cols-2 lg:grid-cols-5 gap-2 h-auto p-1">
                {[
                  { value: 'all', label: 'All Loans' },
                  { value: 'requested', label: 'Requested' },
                  { value: 'funded', label: 'Active' },
                  { value: 'repaid', label: 'Repaid' },
                  { value: 'liquidated', label: 'Liquidated' },
                ].map((option) => (
                  <TabsTrigger
                    key={option.value}
                    value={option.value}
                    className="text-xs sm:text-sm"
                  >
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Total Loans</div>
              <div className="text-3xl font-bold">{loans.length}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Current Filter</div>
              <div className="text-3xl font-bold capitalize">{loanFilter}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground mb-1">Showing</div>
              <div className="text-3xl font-bold">{loans.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Loans List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : loans.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Loans Found</h3>
              <p className="text-muted-foreground">
                {loanFilter === 'all' 
                  ? "You haven't created or participated in any loans yet"
                  : `No ${loanFilter} loans found`
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {loans.map((loan) => {
              const isBorrower = address?.toLowerCase() === loan.borrower.toLowerCase();
              const isLender = loan.lender && address?.toLowerCase() === loan.lender.toLowerCase();
              const principal = parseFloat(loan.principal);
              const interestAmount = (principal * loan.interestBps) / 10000;
              const totalRepayment = principal + interestAmount;
              
              const getStatusColor = (status: string) => {
                const colors: Record<string, string> = {
                  requested: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                  funded: 'bg-green-500/10 text-green-500 border-green-500/20',
                  repaid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                  liquidated: 'bg-red-500/10 text-red-500 border-red-500/20',
                  cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
                };
                return colors[status.toLowerCase()] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
              };

              return (
                <Card key={loan._id} className="glass-card hover:border-primary/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4">
                      {/* Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-indigo-500" />
                          <span className="font-bold text-lg">Loan #{loan.loanId}</span>
                          <Badge variant="outline" className={getStatusColor(loan.status) + ' border'}>
                            {loan.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {isBorrower && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                              Borrower
                            </Badge>
                          )}
                          {isLender && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                              Lender
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-muted/30 p-3 rounded-lg">
                          <div className="text-xs text-muted-foreground mb-1">Principal</div>
                          <div className="font-bold">Ξ{loan.principal}</div>
                          <div className="text-xs text-muted-foreground">≈ ${(principal * 1700).toFixed(0)}</div>
                        </div>
                        <div className="bg-muted/30 p-3 rounded-lg">
                          <div className="text-xs text-muted-foreground mb-1">Interest</div>
                          <div className="font-bold text-green-500">{(loan.interestBps / 100).toFixed(2)}%</div>
                          <div className="text-xs text-muted-foreground">Ξ{interestAmount.toFixed(4)}</div>
                        </div>
                        <div className="bg-muted/30 p-3 rounded-lg">
                          <div className="text-xs text-muted-foreground mb-1">Total Repay</div>
                          <div className="font-bold">Ξ{totalRepayment.toFixed(4)}</div>
                          <div className="text-xs text-muted-foreground">≈ ${(totalRepayment * 1700).toFixed(0)}</div>
                        </div>
                        <div className="bg-muted/30 p-3 rounded-lg">
                          <div className="text-xs text-muted-foreground mb-1">Duration</div>
                          <div className="font-bold">{Math.round(loan.duration / 86400)} Days</div>
                          {loan.status === 'Funded' && loan.startTime && (
                            <div className="text-xs text-muted-foreground">
                              {Math.round((Date.now() / 1000 - loan.startTime) / 86400)}d elapsed
                            </div>
                          )}
                        </div>
                      </div>

                      {/* NFT & Parties */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm pt-2 border-t border-border/50">
                        <div>
                          <span className="text-muted-foreground">NFT Token: </span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">#{loan.tokenId}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Contract: </span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {loan.nftContract.slice(0, 6)}...{loan.nftContract.slice(-4)}
                          </code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Borrower: </span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {loan.borrower.slice(0, 6)}...{loan.borrower.slice(-4)}
                          </code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Lender: </span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {loan.lender ? `${loan.lender.slice(0, 6)}...${loan.lender.slice(-4)}` : 'Not funded yet'}
                          </code>
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-sm text-muted-foreground text-right">
                        Created {formatDistanceToNow(new Date(loan.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionHistory;
