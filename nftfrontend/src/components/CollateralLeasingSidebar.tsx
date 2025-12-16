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
import { leasingMarketplaceService } from '../services/leasingMarketplaceApiService';
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
  initialLoanId?: string;
  initialLeasingType?: 'collateral' | 'wrapped' | 'marketplace';
}

const CollateralLeasingSidebar: React.FC<CollateralLeasingSidebarProps> = ({ 
  open, 
  onOpenChange,
  initialContractAddress,
  initialTokenId,
  initialLoanId,
  initialLeasingType
}) => {

  const { isConnected, provider, address, signer } = useWallet();
  const [activeTab, setActiveTab] = useState('new');
  const [leasingType, setLeasingType] = useState('collateral');
  const [currentTime, setCurrentTime] = useState(Date.now() / 1000);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now() / 1000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
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

  // Leasing Marketplace State
  const [listingPrice, setListingPrice] = useState('0.1');
  const [minDuration, setMinDuration] = useState('1');
  const [maxDuration, setMaxDuration] = useState('30');
  const [rentDuration, setRentDuration] = useState('7');
  const [listingId, setListingId] = useState<number | null>(null);
  const [marketplaceBalance, setMarketplaceBalance] = useState('0');
  const [isMarketplaceOwner, setIsMarketplaceOwner] = useState(false);
  const [myRentals, setMyRentals] = useState<any[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(false);

  // Rental cost breakdown state
  const [listingDetails, setListingDetails] = useState<{
    pricePerSecond: bigint;
    pricePerDay: string;
    minDays: number;
    maxDays: number;
  } | null>(null);
  const [rentalCost, setRentalCost] = useState<{
    rentAmount: string;
    deposit: string;
    platformFee: string;
    wrapFee: string;
    totalRequired: string;
  } | null>(null);
  const [calculatingCost, setCalculatingCost] = useState(false);

  // Helper to format time remaining
  const formatTimeRemaining = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  };



  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      if (isConnected && provider && signer) {
        try {
          await collateralLendingService.initialize(provider);
          await checkPendingWithdrawal();
          
          // Initialize wrapped leasing service with user's wallet
          await wrappedLeasingApiService.initialize(provider, signer);
          await leasingMarketplaceService.initialize(provider, signer);
          
          // Check marketplace balance
          try {
            const balance = await leasingMarketplaceService.getPendingBalance(address);
            setMarketplaceBalance(ethers.formatEther(balance));
          } catch (e) {
            console.error('Error checking marketplace balance:', e);
          }

          // Check marketplace status now that service is initialized
          await checkMarketplaceStatus();
          
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
    if (open) {
      if (initialLeasingType) {
        setLeasingType(initialLeasingType);
      }

      if (initialLoanId) {
          // If we have a loan ID, go directly to manage tab and fetch it
          setLoanIdInput(initialLoanId);
          setActiveTab('manage');
          handleFetchLoan(initialLoanId);
      } else if (initialContractAddress && initialTokenId) {
          setContractAddress(initialContractAddress);
          setTokenId(initialTokenId);
          
          // Check if it's a marketplace listing
          const checkTypeAndSearch = async () => {
              try {
                  // Check marketplace status
                  const id = await leasingMarketplaceService.getListingIdForNFT(initialContractAddress, initialTokenId);
                  if (id) {
                      setLeasingType('marketplace');
                  } else {
                      // Only default to collateral if not already set or if we want to enforce it based on availability
                      // But here we just want to know if it is marketplace. 
                      // If it's not marketplace, we might want to keep the initialLeasingType if provided, 
                      // or default to collateral.
                      if (!initialLeasingType) {
                          setLeasingType('collateral');
                      }
                  }
              } catch (e) {
                  if (!initialLeasingType) {
                      setLeasingType('collateral');
                  }
              }
              // Trigger search
              handleSearch(initialContractAddress, initialTokenId);
          };
          
          checkTypeAndSearch();
      }
    }
  }, [open, initialContractAddress, initialTokenId, initialLoanId, initialLeasingType]);

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
      const receipt = await collateralLendingService.liquidateLoan(loanDetails.loanId);
      
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

      // Update NFT owner to Lender (Current User)
      try {
        await fetch(apiUrl(`/nfts/${loanDetails.tokenId}/transfer/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_owner: address,
            transaction_hash: receipt?.hash,
            price: '0'
          })
        });
        // Ensure it's not listed
        await fetch(apiUrl(`/nfts/${loanDetails.tokenId}/set_listed/`), {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ is_listed: false })
        });
      } catch (err) {
        console.error("Failed to update NFT owner after liquidation", err);
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



  // ===== MARKETPLACE FUNCTIONS =====
  

  const [isLister, setIsLister] = useState(false);

  const checkMarketplaceStatus = async () => {
    if (!contractAddress || !tokenId) return;
    
    // Check if owner is marketplace
    try {
        const id = await leasingMarketplaceService.getListingIdForNFT(contractAddress, tokenId);
        setListingId(id);
        
        if (id) {
            setIsMarketplaceOwner(true);
            // Fetch details to check if I am the lister
            const listing = await leasingMarketplaceService.getListingDetails(id);
            console.log('[CollateralLeasingSidebar] Listing details:', listing);
            
            if (address && listing.owner.toLowerCase() === address.toLowerCase()) {
                setIsLister(true);
            } else {
                setIsLister(false);
            }
            
            // Store listing details for display
            const pricePerSecond = listing.pricePerSecond;
            const pricePerDay = ethers.formatEther(pricePerSecond * 86400n);
            const minDays = Number(listing.minDuration) / 86400;
            const maxDays = Number(listing.maxDuration) / 86400;
            
            setListingDetails({
                pricePerSecond,
                pricePerDay,
                minDays,
                maxDays
            });
            
            // Set default rent duration to min days
            setRentDuration(Math.max(1, Math.ceil(minDays)).toString());
            
            console.log('[CollateralLeasingSidebar] Listing price info:', {
                pricePerSecond: pricePerSecond.toString(),
                pricePerDay,
                minDays,
                maxDays
            });
        } else {
            setIsMarketplaceOwner(false);
            setIsLister(false);
            setListingDetails(null);
        }
    } catch (e) {
        console.error("Error checking marketplace status", e);
    }
  };

  // Calculate rental cost when duration changes
  const calculateRentalCost = async () => {
    if (!listingId || !rentDuration || parseInt(rentDuration) <= 0) {
      setRentalCost(null);
      return;
    }
    
    setCalculatingCost(true);
    try {
      const cost = await leasingMarketplaceService.calculateCost(listingId, parseInt(rentDuration));
      setRentalCost({
        rentAmount: ethers.formatEther(cost.rentAmount),
        deposit: ethers.formatEther(cost.deposit),
        platformFee: ethers.formatEther(cost.platformFee),
        wrapFee: ethers.formatEther(cost.wrapFee),
        totalRequired: ethers.formatEther(cost.totalRequired)
      });
    } catch (e) {
      console.error("Error calculating rental cost", e);
      setRentalCost(null);
    } finally {
      setCalculatingCost(false);
    }
  };

  // Recalculate cost when duration changes
  useEffect(() => {
    if (listingId && rentDuration && isMarketplaceOwner && !isLister) {
      const timer = setTimeout(() => {
        calculateRentalCost();
      }, 500); // Debounce
      return () => clearTimeout(timer);
    }
  }, [listingId, rentDuration, isMarketplaceOwner, isLister]);

  useEffect(() => {
    if (leasingType === 'marketplace' && nftData) {
        checkMarketplaceStatus();
    }
  }, [leasingType, nftData]);

  const handleListForRent = async () => {
    if (!contractAddress || !tokenId || !listingPrice || !minDuration || !maxDuration) {
        toast.error('Please fill all fields');
        return;
    }
    
    setProcessing(true);
    try {
        toast.loading('Listing NFT for rent...');
        const { receipt, listingId: newListingId } = await leasingMarketplaceService.listForRent(
            contractAddress, 
            tokenId, 
            listingPrice, 
            parseInt(minDuration), 
            parseInt(maxDuration)
        );
        toast.dismiss();
        toast.success('NFT Listed for Rent!');
        
        // Save listing to backend
        try {
            const pricePerSecond = ethers.parseEther(listingPrice) / 86400n;
            await fetch(apiUrl('/listings/'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    listingId: newListingId || Date.now(), // fallback if we can't get ID
                    nftAddress: contractAddress,
                    tokenId: tokenId,
                    owner: address,
                    pricePerSecond: pricePerSecond.toString(),
                    minDuration: parseInt(minDuration) * 86400,
                    maxDuration: parseInt(maxDuration) * 86400,
                    status: 'Active'
                })
            });
            console.log('[CollateralLeasingSidebar] Listing saved to backend');
        } catch (err) {
            console.error("Failed to save listing to backend", err);
        }

        // Also update NFT rentable status
        if (nftData && nftData.id) {
            try {
                await fetch(apiUrl(`/nfts/${nftData.id}/set_rentable/`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_rentable: true })
                });
            } catch (err) {
                console.error("Failed to update backend rentable status", err);
            }
        }

        // Refresh
        await checkMarketplaceStatus();
        // Also refresh NFT data to show new owner (Marketplace)
        handleSearch();
    } catch (error: any) {
        toast.dismiss();
        handleTransactionError(error, 'Failed to list NFT');
    } finally {
        setProcessing(false);
    }
  };

  const handleRentNFT = async () => {
    if (!listingId || !rentDuration || !rentalCost) {
      toast.error('Please wait for cost calculation to complete');
      return;
    }
    
    setProcessing(true);
    try {
        toast.loading(`Renting NFT for Ξ ${rentalCost.totalRequired}...`, { id: 'rent' });
        
        // Need to convert back to BigInt for the transaction
        const cost = await leasingMarketplaceService.calculateCost(listingId, parseInt(rentDuration));
        
        const result = await leasingMarketplaceService.rent(listingId, Number(rentDuration), ethers.parseEther(rentalCost.totalRequired));
        toast.dismiss('rent');
        toast.success('NFT Rented Successfully! You now have a Wrapped NFT.');
        
        // Update listing status in backend
        try {
            const expiresAt = Date.now() + parseInt(rentDuration) * 86400 * 1000;
            await fetch(apiUrl(`/listings/${listingId}/status`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: 'Rented',
                    rentedBy: address,
                    rentalExpiresAt: expiresAt
                })
            });
            console.log('[CollateralLeasingSidebar] Listing status updated to Rented');
        } catch (err) {
            console.error("Failed to update listing status", err);
        }

        // Update NFT rentable status
        if (nftData && nftData.id) {
            try {
                await fetch(apiUrl(`/nfts/${nftData.id}/set_rentable/`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_rentable: false })
                });
            } catch (err) {
                console.error("Failed to update backend rentable status", err);
            }
        }

        // Store rental transaction in backend
        if (result.rentalDetails) {
            try {
                await fetch(apiUrl('/rental-transactions/'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'Rented',
                        listingId: listingId,
                        nftAddress: contractAddress,
                        tokenId: tokenId,
                        owner: nftData?.owner_address || '', // We might not have owner if it's not in nftData
                        renter: address,
                        rentAmount: rentalCost.rentAmount.toString(),
                        depositAmount: rentalCost.deposit.toString(),
                        rentDuration: Number(rentDuration) * 86400,
                        expiresAt: new Date(result.rentalDetails.expiresAt * 1000),
                        wrappedTokenId: result.rentalDetails.wId,
                        transactionHash: result.receipt.hash,
                        blockNumber: result.receipt.blockNumber
                    })
                });
                console.log('Rental transaction stored in backend');
            } catch (err) {
                console.error("Failed to store rental transaction in backend", err);
            }
        }

        // Clear rental cost state
        setRentalCost(null);
        
        // Close sidebar and refresh
        toast.info('The wrapped NFT has been minted to your wallet. Check your profile to manage it.', { duration: 5000 });
        handleClose();
    } catch (error: any) {
        toast.dismiss('rent');
        handleTransactionError(error, 'Failed to rent NFT');
    } finally {
        setProcessing(false);
    }
  };

  const handleCancelListing = async () => {
    if (!listingId) return;
    setProcessing(true);
    try {
        toast.loading('Cancelling listing...');
        await leasingMarketplaceService.cancelListing(listingId);
        toast.dismiss();
        toast.success('Listing Cancelled & NFT Returned');
        
        // Update backend status
        if (nftData && nftData.id) {
            try {
                await fetch(apiUrl(`/nfts/${nftData.id}/set_rentable/`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_rentable: false })
                });
            } catch (err) {
                console.error("Failed to update backend rentable status", err);
            }
        }

        await checkMarketplaceStatus();
        handleSearch();
    } catch (e: any) {
        toast.dismiss();
        handleTransactionError(e, 'Failed to cancel');
    } finally {
        setProcessing(false);
    }
  };

  const handleMarketplaceWithdraw = async () => {
    setProcessing(true);
    try {
        toast.loading('Withdrawing funds...');
        await leasingMarketplaceService.withdraw();
        toast.dismiss();
        toast.success('Funds withdrawn!');
        setMarketplaceBalance('0');
    } catch (error: any) {
        toast.dismiss();
        handleTransactionError(error, 'Failed to withdraw');
    } finally {
        setProcessing(false);
    }
  };

  const loadMyRentals = async () => {
    if (!address) return;
    setRentalsLoading(true);
    try {
        const rentals = await leasingMarketplaceService.getMyRentals(address);
        setMyRentals(rentals);
    } catch (e) {
        console.error("Error loading rentals", e);
    } finally {
        setRentalsLoading(false);
    }
  };

  const handleRefundDeposit = async (listingId: number) => {
    setProcessing(true);
    try {
        toast.loading('Refunding deposit...');
        await leasingMarketplaceService.refundDeposit(listingId);
        toast.dismiss();
        toast.success('Deposit Refunded!');
        // Refresh
        await loadMyRentals();
        await leasingMarketplaceService.getPendingBalance(address!).then(b => setMarketplaceBalance(ethers.formatEther(b)));
    } catch (error: any) {
        toast.dismiss();
        handleTransactionError(error, 'Failed to refund deposit');
    } finally {
        setProcessing(false);
    }
  };

  // ===== END MARKETPLACE FUNCTIONS =====

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
                <img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
                NFT Leasing
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
                  
                    <option value="marketplace">Leasing Marketplace</option>
                    <option value="collateral">Collateral Leasing</option>
             
                  </select>
                </div>

                {leasingType === 'program' ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Leasing Program is coming soon!</p>
                  </div>
                ) : leasingType === 'marketplace' ? (
                  /* ===== MARKETPLACE FORM ===== */
                  <div className="space-y-3">
                    <Label>Enter Contract Address + Token ID</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="market-contract" className="text-xs">Contract Address</Label>
                        <Input
                          id="market-contract"
                          placeholder="0x..."
                          value={contractAddress}
                          onChange={(e) => setContractAddress(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="market-token" className="text-xs">Token ID</Label>
                        <Input
                          id="market-token"
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

                      {leasingType === 'collateral' && nftData.collateral_lending && (
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

                      {leasingType === 'marketplace' && (
                        <div className="mt-4 border-t border-border pt-4 space-y-4">
                          {isMarketplaceOwner ? (
                            <div className="space-y-4">
                              <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                                <h4 className="font-semibold text-green-500 flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4" /> Available for Rent
                                </h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                  This NFT is listed on the marketplace.
                                </p>
                              </div>
                              
                              {/* Listing Details */}
                              {listingDetails && (
                                <div className="bg-card/50 rounded-lg p-3 space-y-2">
                                  <h5 className="font-semibold text-sm flex items-center gap-2">
                                    <Info className="h-4 w-4" /> Listing Details
                                  </h5>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-muted/30 p-2 rounded">
                                      <span className="text-muted-foreground">Price/Day</span>
                                      <div className="font-bold text-green-500">Ξ {parseFloat(listingDetails.pricePerDay).toFixed(4)}</div>
                                    </div>
                                    <div className="bg-muted/30 p-2 rounded">
                                      <span className="text-muted-foreground">Duration</span>
                                      <div className="font-bold">{listingDetails.minDays}-{listingDetails.maxDays} days</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Rent Duration Input - only for renters */}
                              {!isLister && (
                                <>
                                  <div className="space-y-2">
                                    <Label>Rent Duration (Days)</Label>
                                    <Input 
                                      type="number" 
                                      min={listingDetails?.minDays || 1}
                                      max={listingDetails?.maxDays || 30}
                                      value={rentDuration} 
                                      onChange={(e) => setRentDuration(e.target.value)} 
                                    />
                                    {listingDetails && (
                                      <p className="text-xs text-muted-foreground">
                                        Min: {listingDetails.minDays} days, Max: {listingDetails.maxDays} days
                                      </p>
                                    )}
                                  </div>
                                  
                                  {/* Cost Breakdown */}
                                  {calculatingCost ? (
                                    <div className="bg-muted/30 rounded-lg p-4 flex items-center justify-center">
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      <span className="text-sm text-muted-foreground">Calculating costs...</span>
                                    </div>
                                  ) : rentalCost && (
                                    <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-4 space-y-3 border border-green-500/20">
                                      <h5 className="font-semibold text-sm">Cost Breakdown</h5>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Rent Amount:</span>
                                          <span>Ξ {parseFloat(rentalCost.rentAmount).toFixed(6)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Deposit (refundable):</span>
                                          <span>Ξ {parseFloat(rentalCost.deposit).toFixed(6)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Platform Fee:</span>
                                          <span>Ξ {parseFloat(rentalCost.platformFee).toFixed(6)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Wrap Fee:</span>
                                          <span>Ξ {parseFloat(rentalCost.wrapFee).toFixed(6)}</span>
                                        </div>
                                        <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
                                          <span className="text-green-500">Total Required:</span>
                                          <span className="text-green-500">Ξ {parseFloat(rentalCost.totalRequired).toFixed(6)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                              
                              <Button 
                                onClick={handleRentNFT} 
                                disabled={processing || isLister || !rentalCost} 
                                className="w-full bg-green-600 hover:bg-green-700"
                              >
                                {processing ? (
                                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Renting...</>
                                ) : isLister ? (
                                  'You own this listing'
                                ) : !rentalCost ? (
                                  'Enter duration to see cost'
                                ) : (
                                  <>🏠 Rent NFT for Ξ {parseFloat(rentalCost.totalRequired).toFixed(4)}</>
                                )}
                              </Button>

                              {isLister && (
                                <div className="pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground mb-2 text-center">You listed this NFT.</p>
                                    <Button 
                                        onClick={handleCancelListing} 
                                        disabled={processing} 
                                        variant="destructive" 
                                        className="w-full"
                                    >
                                        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel Listing & Retrieve NFT'}
                                    </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            address && nftData.owner_address.toLowerCase() === address.toLowerCase() ? (
                              <div className="space-y-4">
                                <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                                  <h4 className="font-semibold text-blue-500">List for Rent</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    You own this NFT. List it on the marketplace.
                                  </p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-xs">Price/Day (ETH)</Label>
                                    <Input value={listingPrice} onChange={(e) => setListingPrice(e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">Min Days</Label>
                                    <Input value={minDuration} onChange={(e) => setMinDuration(e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">Max Days</Label>
                                    <Input value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} />
                                  </div>
                                </div>
                                
                                <Button onClick={handleListForRent} disabled={processing} className="w-full">
                                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'List for Rent'}
                                </Button>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground">
                                <p>Not listed for rent and you are not the owner.</p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="manage" className="space-y-6">
                {leasingType === 'marketplace' ? (
                  <div className="space-y-4">
                    <Card className="glass-card">
                        <CardContent className="p-6">
                            <h3 className="font-semibold mb-4">Marketplace Balance</h3>
                            <div className="text-3xl font-bold mb-4">Ξ {marketplaceBalance}</div>
                            <Button onClick={handleMarketplaceWithdraw} disabled={processing || marketplaceBalance === '0'} className="w-full">
                                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw Funds'}
                            </Button>
                        </CardContent>
                    </Card>
                    
                    <div className="flex justify-between items-center mt-6 mb-2">
                        <h3 className="font-semibold">My Active Rentals</h3>
                        <Button variant="ghost" size="sm" onClick={loadMyRentals}>
                            <RefreshCw className={`h-4 w-4 ${rentalsLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                    
                    {myRentals.length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-4 bg-muted/30 rounded-lg">
                            No active rentals found.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {myRentals.map(rental => (
                                <Card key={rental.listingId} className="glass-card">
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-sm">Listing #{rental.listingId}</span>
                                            <Badge variant="outline">wID: {rental.wId}</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground space-y-1 mb-3">
                                            <div>Deposit: {ethers.formatEther(rental.deposit)} ETH</div>
                                            <div>Expires: {new Date(rental.expiresAt * 1000).toLocaleDateString()}</div>
                                        </div>
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="w-full"
                                            onClick={() => handleRefundDeposit(rental.listingId)}
                                            disabled={processing || Date.now() / 1000 < rental.expiresAt}
                                        >
                                            {Date.now() / 1000 < rental.expiresAt ? 'Lease Active' : 'Refund Deposit'}
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    <div className="text-center text-sm text-muted-foreground mt-4">
                        <p>To manage active listings, use the search in the "New Loan" tab.</p>
                    </div>
                  </div>
                ) : leasingType === 'wrapped' ? (
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
                                {currentTime > loanDetails.startTime + loanDetails.duration ? (
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
                                ) : (
                                    <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20 mt-3">
                                        <div className="flex items-center gap-2 text-blue-500 font-bold mb-2">
                                            <Clock className="h-4 w-4" /> Time Remaining
                                        </div>
                                        <div className="text-xl font-mono text-center mb-2">
                                            {formatTimeRemaining(Math.max(0, (loanDetails.startTime + loanDetails.duration) - currentTime))}
                                        </div>
                                        <p className="text-xs text-muted-foreground text-center">
                                            Loan expires on {new Date((loanDetails.startTime + loanDetails.duration) * 1000).toLocaleString()}
                                        </p>
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
