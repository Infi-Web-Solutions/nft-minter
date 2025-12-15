import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ExternalLink, Copy, X, RefreshCw, ShieldCheck, AlertTriangle, Gift, Package, Clock, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { apiUrl } from '@/config';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { collateralLendingService, LoanStatus, LoanDetails } from '@/services/collateralLendingService';

import { wrappedLeasingApiService } from '../services/wrappedLeasingApiService';
import { ethers } from 'ethers';
import { web3Service } from '@/services/web3Service';

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

  const { isConnected, provider, address, signer } = useWallet();
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

  // Wrapped Leasing State
  const [renterAddress, setRenterAddress] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [wrappedNFTs, setWrappedNFTs] = useState<WrappedNFT[]>([]);
  const [searchWId, setSearchWId] = useState('');
  const [wrappedLoading, setWrappedLoading] = useState(false);
  const [wrappedContractAddress, setWrappedContractAddress] = useState<string>('');
  const [selectedWrappedNFT, setSelectedWrappedNFT] = useState<WrappedNFT | null>(null);
  
  // FeeManager Configuration State
  const [feeManagerConfigured, setFeeManagerConfigured] = useState<boolean | null>(null);
  const [isUserAdmin, setIsUserAdmin] = useState<boolean>(false);
  const [configuringFeeManager, setConfiguringFeeManager] = useState(false);



  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      if (isConnected && provider && signer) {
        try {
          await collateralLendingService.initialize(provider);
          await checkPendingWithdrawal();
          
          // Initialize wrapped leasing service with user's wallet
          await wrappedLeasingApiService.initialize(provider, signer);
          
          // Get contract info for display
          try {
            const contractInfo = await wrappedLeasingApiService.getContractInfo();
            setWrappedContractAddress(contractInfo.wrappedLeasingAddress);
          } catch (error) {
            console.error('Error getting contract info:', error);
          }
          
          // Check FeeManager configuration status
          try {
            const isConfigured = await wrappedLeasingApiService.isFeeManagerConfigured();
            setFeeManagerConfigured(isConfigured);
            
            // For demo purposes, assume user is admin if connected (in real app, check properly)
            setIsUserAdmin(!!address);
            
            if (!isConfigured) {
              console.log('FeeManager not configured.');
            }
          } catch (configError) {
            console.error('Error checking FeeManager config:', configError);
            setFeeManagerConfigured(false);
          }
        } catch (error) {
          console.error('Error initializing services:', error);
        }
      }
    };
    initializeServices();
  }, [isConnected, provider, signer, address, open]);

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

  // ===== WRAPPED LEASING FUNCTIONS =====
  

  const loadWrappedNFTs = async () => {
    if (!address) return;
    setWrappedLoading(true);
    try {
      const nfts = await wrappedLeasingApiService.getUserWrappedNFTs(address);
      setWrappedNFTs(nfts);
    } catch (error) {
      console.error('Error loading wrapped NFTs:', error);
    } finally {
      setWrappedLoading(false);
    }
  };



  const handleWrapNFT = async () => {
    if (!contractAddress || !tokenId || !renterAddress || !durationDays) {
      toast.error('Please fill all fields');
      return;
    }

    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    setProcessing(true);
    try {
      console.log('wrapNFT via API:', contractAddress, tokenId, renterAddress, durationDays);
      
      // Step 1: Check if NFT needs approval
      toast.loading('Checking NFT approval...', { id: 'wrap' });
      
      try {
        const validation = await wrappedLeasingApiService.validateNFT(contractAddress, tokenId, address);
        
        if (validation.needsApproval) {
          toast.dismiss('wrap');
          toast.loading('NFT needs approval. Requesting approval...', { id: 'wrap' });
          
          // Approve the NFT
          try {
            const approvalResult = await wrappedLeasingApiService.approveNFTForWrapping(contractAddress, tokenId);
            
            if (approvalResult.alreadyApproved) {
              toast.dismiss('wrap');
              toast.info('NFT is already approved');
            } else {
              toast.dismiss('wrap');
              toast.success('NFT approved successfully!');
            }
          } catch (approvalError: any) {
            toast.dismiss('wrap');
            
            // Check for user rejection
            if (approvalError?.message?.includes('User denied') || 
                approvalError?.message?.includes('user rejected') ||
                approvalError?.code === 4001) {
              toast.error('Approval cancelled by user');
              setProcessing(false);
              return;
            }
            
            throw new Error(`Failed to approve NFT: ${approvalError.message}`);
          }
        }
      } catch (validationError: any) {
        // If validation fails due to ownership, show clear error
        if (validationError?.message?.includes("don't own")) {
          toast.dismiss('wrap');
          toast.error("You don't own this NFT. You can only wrap NFTs you own.");
          setProcessing(false);
          return;
        }
        throw validationError;
      }

      // Step 2: Wrap the NFT
      toast.loading('Wrapping NFT...', { id: 'wrap' });
      const result = await wrappedLeasingApiService.wrapNFT(
        contractAddress,
        tokenId,
        renterAddress,
        parseFloat(durationDays)
      );
      console.log('wrapNFT result', result);
      toast.dismiss('wrap');

      toast.success(`NFT Wrapped Successfully! wID: ${result.wId}`);
      
      // Reset form
      setContractAddress('');
      setTokenId('');
      setRenterAddress('');
      setDurationDays('30');
      setNftData(null);
      
      // Refresh list and switch to manage tab
      await loadWrappedNFTs();
      setActiveTab('manage');
    } catch (error: any) {
      toast.dismiss('wrap');
      handleTransactionError(error, 'Failed to wrap NFT');
    } finally {
      setProcessing(false);
    }
  };


  const handleUnwrapNFT = async (wId: string) => {
    if (!window.confirm('Are you sure you want to unwrap this NFT?')) return;

    setProcessing(true);
    try {
      toast.loading('Unwrapping NFT...', { id: 'unwrap' });
      await wrappedLeasingApiService.unwrapNFT(wId);
      toast.dismiss('unwrap');
      toast.success('NFT Unwrapped Successfully!');
      await loadWrappedNFTs();
    } catch (error: any) {
      toast.dismiss('unwrap');
      handleTransactionError(error, 'Failed to unwrap NFT');
    } finally {
      setProcessing(false);
    }
  };


  // Handler to configure FeeManager (admin only)
  const handleConfigureFeeManager = async () => {
    if (!isUserAdmin) {
      toast.error('Only admin can configure FeeManager');
      return;
    }

    setConfiguringFeeManager(true);
    try {
      // Get FeeManager address from backend config
      const { getFeeManagerAddress } = await import('@/services/configService');
      const feeManagerAddr = await getFeeManagerAddress();
      
      if (!feeManagerAddr) {
        toast.error('FeeManager address not found in backend configuration');
        return;
      }

      toast.loading('Configuring FeeManager on WrappedLeasing...', { id: 'feemanager' });
      
      const result = await wrappedLeasingApiService.setFeeManager(feeManagerAddr);
      
      toast.dismiss('feemanager');
      toast.success('FeeManager configured successfully!');
      console.log('FeeManager configured:', result);
      
      // Update state
      setFeeManagerConfigured(true);
    } catch (error: any) {
      toast.dismiss('feemanager');
      console.error('Error configuring FeeManager:', error);
      toast.error(error.message || 'Failed to configure FeeManager');
    } finally {
      setConfiguringFeeManager(false);
    }
  };


  const handleSearchWId = async () => {
    if (!searchWId) return;

    setWrappedLoading(true);
    try {
      const info = await wrappedLeasingApiService.getWrappedInfo(searchWId);
      const status = await wrappedLeasingApiService.getLeaseStatus(searchWId);
      
      setWrappedNFTs([{
        wId: searchWId,
        ...info,
        ...status
      }]);
    } catch (error) {
      toast.error('Wrapped NFT not found');
    } finally {
      setWrappedLoading(false);
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

  // ===== END WRAPPED LEASING FUNCTIONS =====

  const handleClose = () => {
    setContractAddress('');
    setTokenId('');
    setNftData(null);
    setNotFound(false);
    setLoanDetails(null);
    setLoanIdInput('');
    // Reset wrapped leasing state
    setRenterAddress('');
    setDurationDays('30');
    setWrappedNFTs([]);
    setSearchWId('');
    setSelectedWrappedNFT(null);
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
              <h2 className="text-2xl font-bold gradient-text flex items-center gap-2">
                {leasingType === 'wrapped' ? (
                  <><Gift className="h-6 w-6" /> NFT Leasing</>
                ) : (
                  <><ShieldCheck className="h-6 w-6" /> NFT Leasing</>
                )}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {leasingType === 'wrapped' 
                  ? 'Wrap & lend your NFTs safely' 
                  : leasingType === 'collateral'
                  ? 'Borrow against your NFTs'
                  : 'Explore leasing options'}
              </p>
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
                ) : leasingType === 'wrapped' ? (
                  /* ===== WRAPPED LEASING FORM ===== */
                  <div className="space-y-4">
                    {/* Info Banner */}
                    <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground">
                              Wrap your NFT into a time-limited wNFT. The renter receives the wNFT for the specified duration. 
                              After expiry, you can unwrap to get your original NFT back.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* FeeManager Configuration Warning */}
                    {feeManagerConfigured === false && (
                      <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30">
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-amber-600 mb-1">
                                Configuration Required
                              </p>
                              <p className="text-xs text-muted-foreground mb-2">
                                The WrappedLeasing contract needs to be configured before wrapping can work.
                              </p>
                              {isUserAdmin ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/10"
                                  onClick={handleConfigureFeeManager}
                                  disabled={configuringFeeManager}
                                >
                                  {configuringFeeManager ? (
                                    <>
                                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                      Configuring...
                                    </>
                                  ) : (
                                    <>
                                      <ShieldCheck className="mr-1 h-3 w-3" />
                                      Configure FeeManager
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <p className="text-xs text-amber-500">
                                  Only the contract admin can configure this. Please contact the administrator.
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* NFT Contract & Token ID */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="wrap-contract" className="text-xs">NFT Contract Address *</Label>
                        <Input
                          id="wrap-contract"
                          placeholder="0x..."
                          value={contractAddress}
                          onChange={(e) => setContractAddress(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="wrap-token" className="text-xs">Token ID *</Label>
                        <Input
                          id="wrap-token"
                          placeholder="123"
                          value={tokenId}
                          onChange={(e) => setTokenId(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Renter Address */}
                    <div className="space-y-2">
                      <Label htmlFor="renter-address" className="text-xs">Renter Address *</Label>
                      <Input
                        id="renter-address"
                        placeholder="0x... (Who will receive the wrapped NFT)"
                        value={renterAddress}
                        onChange={(e) => setRenterAddress(e.target.value)}
                      />
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <Label htmlFor="wrap-duration" className="text-xs">Lease Duration (Days) *</Label>
                      <Input
                        id="wrap-duration"
                        type="number"
                        min="0.0001"
                        step="any"
                        placeholder="30 (or 0.0014 for 2 min test)"
                        value={durationDays}
                        onChange={(e) => setDurationDays(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use 0.0014 for a 2-minute test
                      </p>
                    </div>

                    {/* Summary */}
                    <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Package className="h-4 w-4" /> Summary
                      </h4>
                      <ul className="text-xs space-y-1 text-muted-foreground">
                        <li>• Your NFT will be locked in the contract</li>
                        <li>• Renter receives a time-limited wrapped NFT</li>
                        <li>• Lease expires in {durationDays || '0'} days</li>
                        <li>• You can unwrap after expiry to get your NFT back</li>
                      </ul>
                    </div>

                    {/* Wrap Button */}
                    <Button
                      className="w-full bg-gradient-to-r from-purple-500 to-blue-600"
                      onClick={handleWrapNFT}
                      disabled={processing || !contractAddress || !tokenId || !renterAddress || !durationDays}
                    >
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Wrapping NFT...
                        </>
                      ) : (
                        <>
                          <Gift className="h-4 w-4 mr-2" />
                          Wrap NFT
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  /* ===== COLLATERAL LEASING FORM ===== */
                  <div className="space-y-3">
                    <Label>Enter Contract Address + Token ID</Label>
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
                        <div className="bg-card/50 rounded-lg p-3 col-span-2">
                          <div className="text-sm text-muted-foreground mb-1">Contract Address</div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-black/20 p-1 rounded flex-1 truncate">
                              {contractAddress || nftData.contract_address || 'N/A'}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(contractAddress || nftData.contract_address)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => window.open(`https://sepolia.etherscan.io/address/${contractAddress || nftData.contract_address}`, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
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
                {leasingType === 'wrapped' ? (
                  /* ===== WRAPPED NFTs MANAGEMENT ===== */
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search by Wrapped ID (wId)..."
                        value={searchWId}
                        onChange={(e) => setSearchWId(e.target.value)}
                      />
                      <Button onClick={handleSearchWId} disabled={wrappedLoading}>
                        Search
                      </Button>
                      <Button variant="outline" onClick={loadWrappedNFTs} disabled={wrappedLoading}>
                        <RefreshCw className={`h-4 w-4 ${wrappedLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    {wrappedLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : wrappedNFTs.length === 0 ? (
                      <Card className="glass-card">
                        <CardContent className="p-8 text-center">
                          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                          <h3 className="font-semibold mb-2">No Wrapped NFTs Found</h3>
                          <p className="text-sm text-muted-foreground">
                            You haven't wrapped any NFTs yet. Switch to "New Loan" tab to wrap your first NFT!
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {wrappedNFTs.map((nft) => (
                          <Card key={nft.wId} className={`glass-card hover:border-primary/50 transition-colors ${selectedWrappedNFT?.wId === nft.wId ? 'border-primary' : ''}`}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold">wNFT #{nft.wId}</h4>
                                <div className="flex items-center gap-2">
                                  {nft.active ? (
                                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
                                      Inactive
                                    </Badge>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setSelectedWrappedNFT(selectedWrappedNFT?.wId === nft.wId ? null : nft)}
                                  >
                                    <Info className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Original Token:</span>
                                  <code className="text-xs bg-muted px-2 py-1 rounded">#{nft.originalTokenId}</code>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">NFT Contract:</span>
                                  <div className="flex items-center gap-1">
                                    <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[120px]">
                                      {nft.originalNft.slice(0, 6)}...{nft.originalNft.slice(-4)}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={() => copyToClipboard(nft.originalNft)}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-muted/30 p-2 rounded-lg mt-3 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-purple-500" />
                                <span className="font-medium text-sm">
                                  {nft.timeRemaining !== undefined
                                    ? formatTimeRemaining(nft.timeRemaining)
                                    : 'Calculating...'}
                                </span>
                              </div>

                              {/* Expanded Details View */}
                              {selectedWrappedNFT?.wId === nft.wId && (
                                <div className="mt-4 p-3 bg-gradient-to-r from-purple-500/5 to-blue-500/5 rounded-lg border border-purple-500/20 space-y-3">
                                  <h5 className="font-semibold text-sm flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-purple-500" />
                                    On-Chain Details
                                  </h5>
                                  
                                  <div className="grid grid-cols-1 gap-2 text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Wrapped ID:</span>
                                      <span className="font-mono">{nft.wId}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Owner:</span>
                                      <code className="bg-muted px-1 py-0.5 rounded">
                                        {nft.owner.slice(0, 6)}...{nft.owner.slice(-4)}
                                      </code>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Expires:</span>
                                      <span>{nft.validUntil ? new Date(nft.validUntil * 1000).toLocaleString() : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Status:</span>
                                      <span className={nft.isActive ? 'text-green-500' : 'text-gray-500'}>
                                        {nft.isActive ? '✓ Active Lease' : '✗ Inactive'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Contract Links */}
                                  <div className="pt-2 border-t border-border/40 space-y-2">
                                    <div className="text-xs text-muted-foreground">Smart Contract:</div>
                                    <div className="flex items-center gap-1">
                                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                                        {wrappedContractAddress || 'Loading...'}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0"
                                        onClick={() => copyToClipboard(wrappedContractAddress)}
                                        disabled={!wrappedContractAddress}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0"
                                        onClick={() => window.open(`https://sepolia.etherscan.io/address/${wrappedContractAddress}`, '_blank')}
                                        disabled={!wrappedContractAddress}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {nft.active && nft.owner.toLowerCase() === address?.toLowerCase() && (
                                <Button
                                  className="w-full mt-3"
                                  variant={nft.timeRemaining === 0 ? 'default' : 'outline'}
                                  onClick={() => handleUnwrapNFT(nft.wId)}
                                  disabled={processing || (nft.timeRemaining !== undefined && nft.timeRemaining > 0 && nft.isActive)}
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

                    {/* Wrapped Leasing Contract Info Footer */}
                    {wrappedContractAddress && (
                      <Card className="mt-4 bg-gradient-to-r from-purple-500/5 to-blue-500/5 border-purple-500/20">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck className="h-4 w-4 text-purple-500" />
                            <span className="text-xs font-semibold">NFTs Locked in Smart Contract</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                              {wrappedContractAddress}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => copyToClipboard(wrappedContractAddress)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => window.open(`https://sepolia.etherscan.io/address/${wrappedContractAddress}`, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Your original NFTs are safely locked in this contract until the lease expires.
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  /* ===== COLLATERAL LOAN MANAGEMENT ===== */
                  <>
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
                  </>
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
