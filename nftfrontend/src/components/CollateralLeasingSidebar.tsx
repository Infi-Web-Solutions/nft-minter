import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ExternalLink, Copy, X, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiUrl } from '@/config';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { collateralLendingService, LoanStatus, LoanDetails } from '@/services/collateralLendingService';
import { ethers } from 'ethers';
import { web3Service } from '@/services/web3Service';

interface CollateralLeasingSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContractAddress?: string;
  initialTokenId?: string;
}

const CollateralLeasingSidebar: React.FC<CollateralLeasingSidebarProps> = ({ 
  open, 
  onOpenChange,
  initialContractAddress,
  initialTokenId
}) => {
  const { isConnected, provider, address } = useWallet();
  const [activeTab, setActiveTab] = useState('new');
  const [leasingType, setLeasingType] = useState('collateral');
  
  // Search State
  const [contractAddress, setContractAddress] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [nftData, setNftData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  
  // Loan Creation State
  const [selectedTerm, setSelectedTerm] = useState('6_months');
  const [processing, setProcessing] = useState(false);
  
  // Manage Loan State
  const [loanIdInput, setLoanIdInput] = useState('');
  const [loanDetails, setLoanDetails] = useState<LoanDetails | null>(null);
  const [fetchingLoan, setFetchingLoan] = useState(false);
  
  // Pending Withdrawal State
  const [pendingWithdrawal, setPendingWithdrawal] = useState<string>('0');

  useEffect(() => {
    const initializeService = async () => {
      if (isConnected && provider) {
        try {
          await collateralLendingService.initialize(provider);
          await checkPendingWithdrawal();
        } catch (error) {
          console.error('Error initializing collateral service:', error);
        }
      }
    };
    initializeService();
  }, [isConnected, provider, address, open]);

  // Handle initial data when opening
  useEffect(() => {
    if (open && initialContractAddress && initialTokenId) {
      setContractAddress(initialContractAddress);
      setTokenId(initialTokenId);
      setLeasingType('collateral'); // Default to collateral when opening from card
      // Auto-trigger search after a short delay to ensure state is set
      const timer = setTimeout(() => {
        handleSearch(initialContractAddress, initialTokenId);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, initialContractAddress, initialTokenId]);

  const handleSearch = async (addr = contractAddress, id = tokenId) => {
    const hasContractAndToken = addr.trim() && id.trim();

    if (!hasContractAndToken) {
      toast.error('Please enter both Contract Address and Token ID');
      return;
    }

    setLoading(true);
    setNotFound(false);
    setNftData(null);

    try {
      // First try the backend
      const res = await fetch(apiUrl('/nfts/external/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_address: addr.trim(),
          token_id: id.trim(),
        }),
      });
      
      const data = await res.json();

      if (data.success && data.data) {
        setNftData(data.data);
        toast.success('NFT found!');
      } else {
        // Fallback to direct blockchain fetch
        console.log('Backend search failed, trying direct blockchain fetch...');
        try {
            const externalData = await web3Service.getExternalNFTMetadata(addr.trim(), id.trim());
            if (externalData) {
                setNftData(externalData);
                toast.success('NFT found on blockchain!');
            } else {
                setNotFound(true);
                toast.error('No NFT found for this address');
            }
        } catch (chainError) {
            console.error('Blockchain fetch failed:', chainError);
            setNotFound(true);
            toast.error('No NFT found on blockchain');
        }
      }
    } catch (error) {
      console.error('Error fetching NFT:', error);
      // Fallback to direct blockchain fetch on API error too
      try {
          const externalData = await web3Service.getExternalNFTMetadata(addr.trim(), id.trim());
          if (externalData) {
              setNftData(externalData);
              toast.success('NFT found on blockchain!');
          } else {
              setNotFound(true);
              toast.error('Failed to fetch NFT details');
          }
      } catch (chainError) {
          console.error('Blockchain fetch failed:', chainError);
          setNotFound(true);
          toast.error('Failed to fetch NFT details');
      }
    } finally {
      setLoading(false);
    }
  };

  // ... (handleTransactionError and other handlers remain same)

  // ... (handleCreateLoan, handleFetchLoan, handleFundLoan, etc. remain same)

  // ... (checkPendingWithdrawal, handleWithdrawETH, copyToClipboard, handleClose remain same)

  // ... (getNFTImageUrl, getStatusBadge remain same)

  // ... (render logic)

  // Inside render, specifically the "new" tab content:
  /*
              <TabsContent value="new" className="space-y-6">
                <div className="space-y-3">
                  <Label>Leasing Type</Label>
                  <select
                    className="w-full p-2 rounded-md border bg-background"
                    value={leasingType}
                    onChange={(e) => setLeasingType(e.target.value)}
                  >
                    <option value="wrapped">Wrapped Leasing</option>
                    <option value="collateral">Collateral Leasing</option>
                    <option value="program">Leasing Program (Coming Soon)</option>
                  </select>
                </div>

                {leasingType === 'program' ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Leasing Program is coming soon!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Enter {leasingType === 'wrapped' ? 'Wrapped' : ''} Contract Address + Token ID</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="contract-address" className="text-xs">Contract Address</Label>
                        <Input
                          id="contract-address"
                          placeholder="0x..."
                          value={contractAddress}
                          onChange={(e) => setContractAddress(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="token-id" className="text-xs">Token ID</Label>
                        <Input
                          id="token-id"
                          placeholder="123"
                          value={tokenId}
                          onChange={(e) => setTokenId(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>
                    </div>
                    <Button onClick={() => handleSearch()} disabled={loading} className="w-full">
                      {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</> : 'Search NFT'}
                    </Button>
                  </div>
                )}

                {nftData && leasingType !== 'program' && (
                  // ... (render NFT card details)
                )}
  */


  const handleTransactionError = (error: any, defaultMessage: string) => {
    console.error(defaultMessage, error);
    toast.dismiss();
    
    // Check for user rejection
    if (error?.code === 4001 || 
        error?.code === 'ACTION_REJECTED' || 
        error?.message?.includes('User denied') || 
        error?.message?.includes('user rejected')) {
      toast.error('Transaction cancelled by user');
      return;
    }

    // Check for other common errors
    if (error?.message?.includes('insufficient funds') || error?.code === 'INSUFFICIENT_FUNDS') {
      toast.error('Insufficient funds in your wallet');
      return;
    }

    toast.error(error.message || defaultMessage);
  };

  const handleCreateLoan = async () => {
    if (!isConnected || !provider) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!nftData || !nftData.collateral_lending) return;

    // Validate ownership
    if (address && nftData.owner_address.toLowerCase() !== address.toLowerCase()) {
        toast.error('You do not own this NFT. You can only create loans for NFTs you own.');
        return;
    }

    // Validate that the address is actually a contract
    try {
      const code = await provider.getCode(contractAddress);
      if (code === '0x') {
        toast.error('Invalid Contract Address. You entered a wallet address. Please enter the NFT Collection Address.');
        return;
      }
      
      // Prevent using the Collateral Contract Address as the NFT Address
      if (contractAddress.toLowerCase() === "0x6c963e6EfBAe88Db30272202a9e6352ab7Ecb56e".toLowerCase()) {
         toast.error('Invalid NFT Address. You entered the Collateral Lending Contract address. Please enter the NFT Collection Address.');
         return;
      }

    } catch (err) {
      console.error('Error checking contract code:', err);
      toast.error('Invalid Contract Address');
      return;
    }

    setProcessing(true);
    try {
      // 1. Verify On-Chain Ownership
      toast.loading('Verifying ownership...');
      try {
        const onChainOwner = await collateralLendingService.getNFTOwner(contractAddress, tokenId);
        if (onChainOwner.toLowerCase() !== address.toLowerCase()) {
            toast.dismiss();
            toast.error(`Ownership verification failed. The blockchain says this NFT is owned by ${onChainOwner.slice(0,6)}...${onChainOwner.slice(-4)}`);
            setProcessing(false);
            return;
        }
      } catch (err) {
          console.error('Error verifying ownership:', err);
          toast.dismiss();
          toast.error('Failed to verify NFT ownership on-chain. Ensure the Token ID exists.');
          setProcessing(false);
          return;
      }
      toast.dismiss();

      // 2. Approve NFT
      toast.loading('Approving NFT transfer...');
      await collateralLendingService.approveNFT(contractAddress, tokenId);
      toast.dismiss();
      toast.success('NFT Approved!');

      // 2. Calculate params
      // Get term data (fallback to 3_months for test duration)
      const termData = nftData.collateral_lending.loan_terms[selectedTerm] || nftData.collateral_lending.loan_terms['3_months'];
      
      // Duration in seconds (approximate)
      const durationMap: Record<string, number> = {
        '5_minutes': 5 * 60, // Test duration
        '3_months': 90 * 24 * 3600,
        '6_months': 180 * 24 * 3600,
        '12_months': 365 * 24 * 3600
      };
      const duration = durationMap[selectedTerm];
      
      // Interest BPS (e.g. 10% = 1000)
      // Assuming interest_rate.annual_percentage is like "12%"
      const interestRateString = nftData.collateral_lending.interest_rate.annual_percentage;
      const interestRate = parseFloat(interestRateString.replace('%', ''));
      const interestBps = Math.floor(interestRate * 100);

      // Principal
      const principal = nftData.collateral_lending.max_loan.eth.toString();

      toast.loading('Creating Loan Request...');
      const loanId = await collateralLendingService.createLoanRequest(
        contractAddress,
        tokenId,
        principal,
        interestBps,
        duration
      );
      toast.dismiss();

      if (loanId) {
        toast.success(`Loan Requested Successfully! Loan ID: ${loanId}`);
        
        // Save loan to backend
        try {
            await fetch(apiUrl('/loans/'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    loanId: loanId.toString(),
                    nftContract: contractAddress,
                    tokenId: tokenId,
                    borrower: address,
                    principal: principal,
                    interestBps: interestBps,
                    duration: duration,
                    transactionHash: null // We don't have the hash easily here unless we capture the receipt better, but it's optional
                })
            });
        } catch (backendError) {
            console.error('Failed to save loan to backend:', backendError);
            // Don't block the UI, just log it
        }

        setLoanIdInput(loanId.toString());
        setActiveTab('manage');
        handleFetchLoan(loanId.toString());
      } else {
        toast.error('Failed to get Loan ID');
      }

    } catch (error: any) {
      handleTransactionError(error, 'Failed to create loan');
    } finally {
      setProcessing(false);
    }
  };

  const handleFetchLoan = async (id: string = loanIdInput) => {
    if (!id) return;
    setFetchingLoan(true);
    setLoanDetails(null);
    try {
      const details = await collateralLendingService.getLoanDetails(parseInt(id));
      setLoanDetails(details);
      
      // Also fetch NFT details to show image/owner
      if (details.nftContract && details.tokenId) {
          // Reuse the search logic
          setContractAddress(details.nftContract);
          setTokenId(details.tokenId.toString());
          
          // We need to call the backend to get metadata
          const res = await fetch(apiUrl(`/nfts/external/${details.nftContract}/${details.tokenId}`));
          const data = await res.json();
          if (data.success) {
            setNftData(data.data);
          }
      }

    } catch (error) {
      console.error('Error fetching loan:', error);
      toast.error('Failed to fetch loan details');
    } finally {
      setFetchingLoan(false);
    }
  };

  const handleFundLoan = async () => {
    if (!loanDetails || !address) return;
    setProcessing(true);
    try {
      toast.loading('Funding Loan...');
      const receipt = await collateralLendingService.fundLoan(loanDetails.loanId, loanDetails.principal);
      
      // Update backend with lender and status
      try {
        await fetch(apiUrl(`/loans/${loanDetails.loanId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'Funded',
            lender: address,
            startTime: Math.floor(Date.now() / 1000)
          })
        });
      } catch (backendError) {
        console.error('Failed to update backend:', backendError);
      }

      toast.dismiss();
      toast.success('Loan Funded Successfully! Money sent to borrower.');
      toast.info('Note: If the borrower cannot receive ETH directly, they may need to manually withdraw from the contract.', { duration: 5000 });
      
      // Refresh loan details to show updated status
      await handleFetchLoan();
      
      // Check if borrower has pending withdrawal
      await checkPendingWithdrawal();
    } catch (error: any) {
      handleTransactionError(error, 'Failed to fund loan');
    } finally {
      setProcessing(false);
    }
  };

  const handleRepayLoan = async () => {
    if (!loanDetails) return;
    setProcessing(true);
    try {
      toast.loading('Calculating Repayment...');
      const repayAmount = await collateralLendingService.computeRepayAmount(loanDetails.loanId);
      
      toast.loading(`Repaying ${repayAmount} ETH...`);
      await collateralLendingService.repayLoan(loanDetails.loanId, repayAmount);
      
      // Update backend status
      try {
        await fetch(apiUrl(`/loans/${loanDetails.loanId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Repaid' })
        });
      } catch (backendError) {
        console.error('Failed to update backend:', backendError);
      }

      toast.dismiss();
      toast.success('Loan Repaid Successfully! NFT Unlocked.');
      toast.info('Note: If the lender cannot receive ETH directly, they may need to manually withdraw from the contract.', { duration: 5000 });
      
      // Refresh loan details
      await handleFetchLoan();
      
      // Check if lender has pending withdrawal
      await checkPendingWithdrawal();
    } catch (error: any) {
      handleTransactionError(error, 'Failed to repay loan');
    } finally {
      setProcessing(false);
    }
  };

  const handleLiquidateLoan = async () => {
    if (!loanDetails) return;
    setProcessing(true);
    try {
      toast.loading('Liquidating Loan...');
      await collateralLendingService.liquidateLoan(loanDetails.loanId);
      
      // Update backend status
      try {
        await fetch(apiUrl(`/loans/${loanDetails.loanId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Liquidated' })
        });
      } catch (backendError) {
        console.error('Failed to update backend:', backendError);
        // Don't fail the transaction if backend update fails
      }

      toast.dismiss();
      toast.success('Loan Liquidated! NFT transferred to you.');
      
      // Refresh loan details
      await handleFetchLoan(loanDetails.loanId.toString());
    } catch (error: any) {
      handleTransactionError(error, 'Failed to liquidate loan');
    } finally {
      setProcessing(false);
    }
  };

  const checkPendingWithdrawal = async () => {
    if (!address) return;
    try {
      const pending = await collateralLendingService.getPendingETHWithdrawal(address);
      setPendingWithdrawal(pending);
      if (parseFloat(pending) > 0) {
        toast.info(`You have ${pending} ETH pending withdrawal from the contract!`, { duration: 6000 });
      }
    } catch (error) {
      console.error('Error checking pending withdrawal:', error);
    }
  };

  const handleWithdrawETH = async () => {
    setProcessing(true);
    try {
      toast.loading('Withdrawing pending ETH...');
      await collateralLendingService.withdrawETH();
      toast.dismiss();
      toast.success(`Successfully withdrew ${pendingWithdrawal} ETH!`);
      setPendingWithdrawal('0');
    } catch (error: any) {
      handleTransactionError(error, 'Failed to withdraw ETH');
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleClose = () => {
    setContractAddress('');
    setTokenId('');
    setNftData(null);
    setNotFound(false);
    setLoanDetails(null);
    setLoanIdInput('');
    onOpenChange(false);
  };

  const getNFTImageUrl = (nft: any) => {
    if (!nft) return '';
    let imageUrl = nft.image_url || '';
    if (imageUrl && imageUrl.startsWith('ipfs://')) {
      const ipfsHash = imageUrl.replace('ipfs://', '');
      imageUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
    }
    return imageUrl;
  };

  const getStatusBadge = (status: LoanStatus) => {
    switch (status) {
      case LoanStatus.Requested: return <Badge variant="outline" className="bg-blue-500/10 text-blue-500">Requested</Badge>;
      case LoanStatus.Funded: return <Badge variant="outline" className="bg-green-500/10 text-green-500">Active (Funded)</Badge>;
      case LoanStatus.Repaid: return <Badge variant="outline" className="bg-purple-500/10 text-purple-500">Repaid</Badge>;
      case LoanStatus.Liquidated: return <Badge variant="outline" className="bg-red-500/10 text-red-500">Liquidated</Badge>;
      case LoanStatus.Cancelled: return <Badge variant="outline" className="bg-gray-500/10 text-gray-500">Cancelled</Badge>;
      default: return <Badge>Unknown</Badge>;
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 transition-opacity" onClick={handleClose} />
      <div className={`fixed top-0 right-0 h-full w-full md:w-[500px] lg:w-[600px] bg-background shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-border/40">
            <div>
              <h2 className="text-2xl font-bold gradient-text">Collateral Leasing</h2>
              <p className="text-sm text-muted-foreground mt-1">Borrow against your NFTs</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} className="shrink-0">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Pending Withdrawal Banner */}
            {parseFloat(pendingWithdrawal) > 0 && (
              <Card className="mb-4 border-yellow-500/50 bg-yellow-500/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                      <div>
                        <div className="font-semibold text-yellow-500">Pending Withdrawal</div>
                        <div className="text-sm text-muted-foreground">
                          You have <span className="font-bold text-yellow-500">{pendingWithdrawal} ETH</span> waiting to be claimed
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={handleWithdrawETH} 
                      disabled={processing}
                      className="bg-yellow-600 hover:bg-yellow-700 shrink-0"
                      size="sm"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="new">New Loan</TabsTrigger>
                <TabsTrigger value="manage">Manage Loan</TabsTrigger>
              </TabsList>

              <TabsContent value="new" className="space-y-6">
                <div className="space-y-3">
                  <Label>Leasing Type</Label>
                  <select
                    className="w-full p-2 rounded-md border bg-background"
                    value={leasingType}
                    onChange={(e) => setLeasingType(e.target.value)}
                  >
                    <option value="wrapped">Wrapped Leasing</option>
                    <option value="collateral">Collateral Leasing</option>
                    <option value="program">Leasing Program (Coming Soon)</option>
                  </select>
                </div>

                {leasingType === 'program' ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Leasing Program is coming soon!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Enter {leasingType === 'wrapped' ? 'Wrapped' : ''} Contract Address + Token ID</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="contract-address" className="text-xs">Contract Address</Label>
                        <Input
                          id="contract-address"
                          placeholder="0x..."
                          value={contractAddress}
                          onChange={(e) => setContractAddress(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="token-id" className="text-xs">Token ID</Label>
                        <Input
                          id="token-id"
                          placeholder="123"
                          value={tokenId}
                          onChange={(e) => setTokenId(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>
                    </div>
                    <Button onClick={() => handleSearch()} disabled={loading} className="w-full">
                      {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</> : 'Search NFT'}
                    </Button>
                  </div>
                )}

                {nftData && leasingType !== 'program' && (
                  <Card className="glass-card border-0">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0">
                          <img src={getNFTImageUrl(nftData)} alt={nftData.name} className="w-full h-full object-cover" 
                            onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/150?text=NFT'; }} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{nftData.name}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">{nftData.description}</p>
                        </div>
                      </div>

                      {/* NFT Details Grid */}
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-card/50 rounded-lg p-3">
                          <div className="text-sm text-muted-foreground mb-1">Price</div>
                          <div className="font-semibold text-green-500">
                            {nftData.price ? (
                              <>
                                <div>Ξ{nftData.price}</div>
                                <div className="text-xs text-muted-foreground font-normal">
                                  ${(parseFloat(nftData.price) * 1700).toFixed(2)}
                                </div>
                              </>
                            ) : (
                              'Not for sale'
                            )}
                          </div>
                        </div>
                        <div className="bg-card/50 rounded-lg p-3">
                          <div className="text-sm text-muted-foreground mb-1">Collection</div>
                          <div className="font-semibold">{nftData.collection || 'N/A'}</div>
                        </div>
                          <div className="bg-card/50 rounded-lg p-3 col-span-2">
                          <div className="text-sm text-muted-foreground mb-1">Owner</div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-black/20 p-1 rounded flex-1 truncate">
                              {nftData.owner_address}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(nftData.owner_address)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          {address && nftData.owner_address.toLowerCase() !== address.toLowerCase() && (
                              <div className="text-xs text-red-500 mt-2 flex items-center gap-1 font-medium bg-red-500/10 p-2 rounded">
                                  <AlertTriangle className="h-3 w-3" />
                                  You do not own this NFT
                              </div>
                          )}
                        </div>
                      </div>

                      {nftData.collateral_lending && (
                        <div className="mt-4 border-t border-border pt-4 space-y-4">
                          <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg p-4">
                            <div className="text-sm text-muted-foreground mb-1">Max Loan Amount</div>
                            <div className="text-2xl font-bold">Ξ{nftData.collateral_lending.max_loan.eth}</div>
                            <div className="text-sm text-muted-foreground">${nftData.collateral_lending.max_loan.usd.toLocaleString()}</div>
                          </div>

                          <div>
                            <Label className="mb-2 block">Select Term</Label>
                            <select
                              className="w-full p-2 rounded-md border bg-background"
                              value={selectedTerm}
                              onChange={(e) => setSelectedTerm(e.target.value)}
                            >
                              <option value="5_minutes">5 Minutes (Test)</option>
                              <option value="3_months">3 Months</option>
                              <option value="6_months">6 Months</option>
                              <option value="12_months">12 Months</option>
                            </select>
                          </div>

                          <div className="bg-card/30 rounded-lg p-3 text-sm space-y-2">
                             <div className="flex justify-between">
                                <span className="text-muted-foreground">Interest Rate:</span>
                                <span className="font-semibold">{nftData.collateral_lending.interest_rate.annual_percentage} APR</span>
                             </div>
                             <div className="flex justify-between">
                                <span className="text-muted-foreground">Monthly Payment:</span>
                                <span className="font-semibold">
                                    Ξ{nftData.collateral_lending.loan_terms[selectedTerm]?.monthly_payment || nftData.collateral_lending.loan_terms['3_months']?.monthly_payment || '0.00'}
                                </span>
                             </div>
                          </div>

                          <Button 
                            className="w-full bg-gradient-to-r from-purple-500 to-blue-600"
                            onClick={handleCreateLoan}
                            disabled={processing}
                          >
                            {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Start Leasing (Create Loan)'}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="manage" className="space-y-6">
                <div className="flex gap-2">
                  <Input 
                    placeholder="Enter Loan ID" 
                    value={loanIdInput} 
                    onChange={(e) => setLoanIdInput(e.target.value)}
                  />
                  <Button onClick={() => handleFetchLoan()} disabled={fetchingLoan}>
                    {fetchingLoan ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                {loanDetails && (
                  <Card className="glass-card border-0">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold">Loan #{loanDetails.loanId}</h3>
                          <div className="mt-1">{getStatusBadge(loanDetails.status)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Principal</div>
                          <div className="text-xl font-bold">Ξ{loanDetails.principal}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-card/50 p-3 rounded-lg">
                          <div className="text-muted-foreground">Borrower</div>
                          <div className="font-mono truncate">{loanDetails.borrower.slice(0, 6)}...{loanDetails.borrower.slice(-4)}</div>
                        </div>
                        <div className="bg-card/50 p-3 rounded-lg">
                          <div className="text-muted-foreground">Lender</div>
                          <div className="font-mono truncate">{loanDetails.lender === ethers.ZeroAddress ? 'None' : `${loanDetails.lender.slice(0, 6)}...${loanDetails.lender.slice(-4)}`}</div>
                        </div>
                        <div className="bg-card/50 p-3 rounded-lg">
                          <div className="text-muted-foreground">Interest</div>
                          <div>{(loanDetails.interestBps / 100).toFixed(2)}%</div>
                        </div>
                        <div className="bg-card/50 p-3 rounded-lg">
                          <div className="text-muted-foreground">Duration</div>
                          <div>{Math.floor(loanDetails.duration / (24 * 3600))} Days</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-4 border-t border-border space-y-3">
                        {loanDetails.status === LoanStatus.Requested && address && (
                          address.toLowerCase() !== loanDetails.borrower.toLowerCase() ? (
                            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleFundLoan} disabled={processing}>
                              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Fund Loan (Lend ETH)'}
                            </Button>
                          ) : (
                            <div className="text-center text-sm text-muted-foreground">Waiting for a lender...</div>
                          )
                        )}

                        {loanDetails.status === LoanStatus.Funded && (
                          <>
                            {address && address.toLowerCase() === loanDetails.borrower.toLowerCase() && (
                              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleRepayLoan} disabled={processing}>
                                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Repay Loan & Unlock NFT'}
                              </Button>
                            )}
                            
                            {/* Liquidation Check */}
                            {Date.now() / 1000 > loanDetails.startTime + loanDetails.duration && (
                               <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                                 <div className="flex items-center gap-2 text-red-500 font-bold mb-2">
                                   <AlertTriangle className="h-4 w-4" /> Loan Expired
                                 </div>
                                 <p className="text-xs text-muted-foreground mb-3">The loan duration has passed. The lender can now liquidate the NFT.</p>
                                 {address && address.toLowerCase() === loanDetails.lender.toLowerCase() && (
                                   <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleLiquidateLoan} disabled={processing}>
                                     {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Liquidate NFT'}
                                   </Button>
                                 )}
                               </div>
                            )}
                          </>
                        )}
                        
                        {loanDetails.status === LoanStatus.Repaid && (
                            <div className="flex items-center justify-center gap-2 text-green-500 font-medium p-3 bg-green-500/10 rounded-lg">
                                <ShieldCheck className="h-5 w-5" /> Loan Repaid & NFT Returned
                            </div>
                        )}
                        
                        {loanDetails.status === LoanStatus.Liquidated && (
                            <div className="flex items-center justify-center gap-2 text-red-500 font-medium p-3 bg-red-500/10 rounded-lg">
                                <AlertTriangle className="h-5 w-5" /> Loan Liquidated
                            </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
};

export default CollateralLeasingSidebar;
