import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Clock, DollarSign, Percent } from 'lucide-react';
import { apiUrl } from '@/config';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { collateralLendingService } from '@/services/collateralLendingService';

interface LoanRequest {
  loanId: number;
  nftContract: string;
  tokenId: string;
  borrower: string;
  principal: string;
  interestBps: number;
  duration: number;
  status: string;
  nftData?: {
    name: string;
    image_url: string;
  };
}

const LendingMarketplace = () => {
  const { isConnected, provider, address } = useWallet();
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fundingLoanId, setFundingLoanId] = useState<number | null>(null);

  useEffect(() => {
    fetchLoans();
  }, []);

  useEffect(() => {
    if (isConnected && provider) {
      collateralLendingService.initialize(provider);
    }
  }, [isConnected, provider]);

  const fetchLoans = async () => {
    try {
      const res = await fetch(apiUrl('/loans/open'));
      const data = await res.json();
      if (data.success) {
        setLoans(data.data);
      }
    } catch (error) {
      console.error('Error fetching loans:', error);
      toast.error('Failed to load loan requests');
    } finally {
      setLoading(false);
    }
  };

  const handleFundLoan = async (loan: LoanRequest) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (address?.toLowerCase() === loan.borrower.toLowerCase()) {
        toast.error('You cannot fund your own loan request');
        return;
    }

    setFundingLoanId(loan.loanId);
    try {
      toast.loading('Funding Loan...');
      await collateralLendingService.fundLoan(loan.loanId, loan.principal);
      
      // Update backend status
      await fetch(apiUrl(`/loans/${loan.loanId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status: 'Funded',
            lender: address,
            startTime: Math.floor(Date.now() / 1000)
        })
      });

      toast.dismiss();
      toast.success('Loan Funded Successfully!');
      fetchLoans(); // Refresh list
    } catch (error: any) {
      console.error('Error funding loan:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to fund loan');
    } finally {
      setFundingLoanId(null);
    }
  };

  const getDurationLabel = (seconds: number) => {
    const days = Math.round(seconds / (24 * 3600));
    return `${days} Days`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">Lending Marketplace</h1>
            <p className="text-muted-foreground">Earn interest by funding NFT-backed loans</p>
          </div>
          <Button onClick={fetchLoans} variant="outline" size="icon">
            <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : loans.length === 0 ? (
          <div className="text-center py-20 bg-card/30 rounded-xl border border-border/50">
            <h3 className="text-xl font-semibold mb-2">No Active Loan Requests</h3>
            <p className="text-muted-foreground">Check back later or create a loan request yourself!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loans.map((loan) => (
              <Card key={loan.loanId} className="glass-card overflow-hidden hover:border-primary/50 transition-colors">
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {loan.nftData?.image_url ? (
                    <img 
                      src={loan.nftData.image_url.replace('ipfs://', 'https://ipfs.io/ipfs/')} 
                      alt={loan.nftData.name || 'NFT'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary/20">
                      <span className="text-muted-foreground">No Image</span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-blue-500/90 hover:bg-blue-600/90">
                      #{loan.loanId}
                    </Badge>
                  </div>
                </div>
                
                <CardHeader>
                  <CardTitle className="truncate text-lg">
                    {loan.nftData?.name || `NFT #${loan.tokenId}`}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate max-w-[150px]">{loan.nftContract}</span>
                    <ExternalLink className="h-3 w-3 cursor-pointer" onClick={() => window.open(`https://sepolia.etherscan.io/address/${loan.nftContract}`, '_blank')} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-card/50 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Principal
                      </div>
                      <div className="font-bold text-lg">Ξ{loan.principal}</div>
                    </div>
                    <div className="bg-card/50 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Percent className="h-3 w-3" /> Interest
                      </div>
                      <div className="font-bold text-lg text-green-500">{(loan.interestBps / 100).toFixed(2)}%</div>
                    </div>
                    <div className="bg-card/50 p-3 rounded-lg col-span-2">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Duration
                      </div>
                      <div className="font-bold">{getDurationLabel(loan.duration)}</div>
                    </div>
                  </div>
                </CardContent>

                <CardFooter>
                  <Button 
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                    onClick={() => handleFundLoan(loan)}
                    disabled={fundingLoanId === loan.loanId}
                  >
                    {fundingLoanId === loan.loanId ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
                    ) : (
                      'Fund Loan'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LendingMarketplace;
