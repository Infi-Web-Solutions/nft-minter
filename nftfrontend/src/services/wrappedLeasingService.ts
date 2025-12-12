// Wrapped Leasing Service - Interact with WrappedLeasing smart contract
import { ethers } from 'ethers';
import wrappedLeasingABI from '../contracts/WrappedLeasing.json';
import { getWrappedLeasingAddress, getFeeManagerAddress } from './configService';
import { Console } from 'console';

class WrappedLeasingService {
  private contract: ethers.Contract | null = null;
  private signer: ethers.Signer | null = null;
  private contractAddress: string = '';

  /**
   * Initialize the service with a provider and signer
   */
  async initialize(provider: ethers.Provider, signer: ethers.Signer) {
    this.signer = signer;
    
    // Get contract address from backend config
    this.contractAddress = await getWrappedLeasingAddress();
    
    this.contract = new ethers.Contract(
      this.contractAddress,
      wrappedLeasingABI.abi,
      signer
    );

    // Debug: check contract state
    await this.debugContractState();
  }

  /**
   * Debug method to check contract state
   */
  async debugContractState() {
    if (!this.contract) return;
    
    try {
      console.log('=== WrappedLeasing Contract Debug ===');
      console.log('Contract Address:', this.contractAddress);
      
      const feeManagerAddr = await this.contract.feeManager();
      console.log('FeeManager Address on contract:', feeManagerAddr);
      
      if (feeManagerAddr && feeManagerAddr !== ethers.ZeroAddress) {
        // Try to call feeManager to check if it's valid
        const feeManagerAbi = [
          'function leasingFeeBps() external view returns (uint16)',
          'function treasury() external view returns (address)'
        ];
        const provider = this.signer?.provider;
        if (provider) {
          const feeManager = new ethers.Contract(feeManagerAddr, feeManagerAbi, provider);
          try {
            const leasingFeeBps = await feeManager.leasingFeeBps();
            console.log('FeeManager leasingFeeBps:', leasingFeeBps.toString());
            const treasury = await feeManager.treasury();
            console.log('FeeManager treasury:', treasury);
            console.log('FeeManager is working correctly!');
          } catch (e: any) {
            console.error('FeeManager is NOT working:', e.message);
          }
        }
      } else {
        console.warn('⚠️ FeeManager address is zero/invalid on the WrappedLeasing contract!');
        console.warn('⚠️ NFT wrapping will NOT work until FeeManager is configured.');
        console.log('');
        console.log('HOW TO FIX:');
        console.log('1. Run: node initialize-fee-manager.js <ADMIN_ADDRESS>');
        console.log('   (from the nft-minter-backend-node folder)');
        console.log('2. Or redeploy using: npx hardhat run scripts/deploy-wrapped-only.js --network testnet');
        console.log('');
        
        try {
          const backendFeeManagerAddr = await getFeeManagerAddress();
          if (backendFeeManagerAddr && backendFeeManagerAddr !== ethers.ZeroAddress) {
            console.log('FeeManager address available from backend:', backendFeeManagerAddr);
            console.log('This address needs to be set on the WrappedLeasing contract by an admin.');
          }
        } catch (configError) {
          console.log('Could not fetch FeeManager address from backend.');
        }
      }
      
      const wCounter = await this.contract.wCounter();
      console.log('Current wCounter (total wrapped):', wCounter.toString());
      console.log('=== End Debug ===');
    } catch (error: any) {
      console.error('Debug error:', error.message);
    }
  }

  /**
   * Wrap an NFT into a time-limited wrapped NFT
   * @param nftContract - Address of the original NFT contract
   * @param tokenId - Token ID of the NFT to wrap
   * @param renterAddress - Address who will receive the wrapped NFT
   * @param durationDays - Duration in days for the lease
   * @param metadataURI - Optional metadata URI for the wrapped NFT
   * @param feeInEth - Fee to pay for wrapping (calculated from contract)
   */
  async wrapNFT(
    nftContract: string,
    tokenId: string,
    renterAddress: string,
    durationDays: number,
    metadataURI: string = '',
    feeInEth: string = '0'
  ) {
    if (!this.contract) throw new Error('Service not initialized');
    if (!this.signer) throw new Error('Signer not available');

    // Convert to seconds and ensure it's an integer (smart contract requires uint256)
    const durationSeconds = Math.max(1, Math.floor(durationDays * 24 * 60 * 60));
    
    console.log('=== Wrapping NFT ===');
    console.log('NFT Contract:', nftContract);
    console.log('Token ID:', tokenId);
    console.log('Renter:', renterAddress);
    console.log('Duration (seconds):', durationSeconds);

    // Step 1: Verify ownership BEFORE attempting wrap
    const signerAddress = await this.signer.getAddress();
    console.log('Signer Address:', signerAddress);
    const nftAbi = [
      'function ownerOf(uint256 tokenId) public view returns (address)',
      'function getApproved(uint256 tokenId) public view returns (address)',
      'function isApprovedForAll(address owner, address operator) public view returns (bool)'
    ];
    const nftContractInstance = new ethers.Contract(nftContract, nftAbi, this.signer.provider!);

    try {
      const owner = await nftContractInstance.ownerOf(tokenId);
      console.log('NFT Owner:', owner);
      console.log('Signer Address:', signerAddress);
      
      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`You don't own this NFT. The owner is ${owner.slice(0, 6)}...${owner.slice(-4)}`);
      }
    } catch (error: any) {
      if (error.message?.includes("don't own")) throw error;
      if (error.message?.includes('ERC721NonexistentToken') || error.code === 'CALL_EXCEPTION') {
        throw new Error(`Token ID ${tokenId} does not exist in this contract.`);
      }
      console.error('Ownership check failed:', error);
      throw new Error('Failed to verify NFT ownership. Please check the contract address and token ID.');
    }

    // Step 2: Verify approval
    try {
      const approved = await nftContractInstance.getApproved(tokenId);
      const approvedForAll = await nftContractInstance.isApprovedForAll(signerAddress, this.contractAddress);
      
      console.log('Approved address:', approved);
      console.log('ApprovedForAll:', approvedForAll);
      console.log('WrappedLeasing contract:', this.contractAddress);
      
      if (approved.toLowerCase() !== this.contractAddress.toLowerCase() && !approvedForAll) {
        throw new Error('NFT is not approved for the Wrapped Leasing contract. Please approve it first.');
      }
    } catch (error: any) {
      if (error.message?.includes('not approved')) throw error;
      console.error('Approval check error:', error);
      throw new Error('Failed to verify NFT approval. Please try approving the NFT again.');
    }

    // Step 3: Check FeeManager and calculate required fee
    let requiredFee = BigInt(0);
    let feeManagerAddress: string;
    
    try {
      feeManagerAddress = await this.contract.feeManager();
      console.log('FeeManager address on contract:', feeManagerAddress);
      
      // CRITICAL: If FeeManager is zero address, try to auto-configure it
      if (!feeManagerAddress || feeManagerAddress === ethers.ZeroAddress) {
        console.warn('⚠️ FeeManager is not configured on WrappedLeasing contract!');
        
        // Try to get FeeManager address from backend config
        const backendFeeManagerAddr = await getFeeManagerAddress();
        console.log('FeeManager address from backend:', backendFeeManagerAddr);
        
        if (backendFeeManagerAddr && backendFeeManagerAddr !== ethers.ZeroAddress) {
          throw new Error(
            'WrappedLeasing contract is not properly configured. ' +
            'FeeManager address needs to be set by the admin. ' +
            'Please run: node initialize-fee-manager.js <ADMIN_ADDRESS> from the backend folder.'
          );
        } else {
          throw new Error(
            'WrappedLeasing contract is not properly configured. ' +
            'FeeManager address is not set. Please contact the administrator.'
          );
        }
      }
      
      const feeManagerAbi = [
        'function leasingFeeBps() external view returns (uint16)',
        'function calcBps(uint256 amount, uint16 bps) external pure returns (uint256)'
      ];
      const feeManager = new ethers.Contract(feeManagerAddress, feeManagerAbi, this.signer.provider!);
      
      const leasingFeeBps = await feeManager.leasingFeeBps();
      console.log('Leasing fee BPS:', leasingFeeBps);
      
      // Calculate fee: calcBps(durationSeconds, leasingFeeBps)
      const calculatedFee = await feeManager.calcBps(BigInt(durationSeconds), leasingFeeBps);
      console.log('Calculated fee (wei):', calculatedFee.toString());
      
      requiredFee = calculatedFee;
    } catch (error: any) {
      // Re-throw if it's our own error about FeeManager not being configured
      if (error.message?.includes('FeeManager') || error.message?.includes('admin')) throw error;
      console.error('Error calculating fee from FeeManager:', error);
      throw new Error('Failed to calculate fee from FeeManager. The contract may not be properly configured.');
    }

    // Add a small buffer to cover any gas price variations (10% more)
    const feeWithBuffer = requiredFee > BigInt(0) 
      ? (requiredFee * BigInt(110)) / BigInt(100) 
      : ethers.parseEther('0.0001'); // Minimum fee if calculated fee is 0
    
    console.log('Fee with buffer (wei):', feeWithBuffer.toString());


    // Step 4: Execute the wrap transaction
    try {
      console.log('Calling wrap() with:');
      console.log('  nft:', nftContract);
      console.log('  tokenId:', tokenId);
      console.log('  renter:', renterAddress);
      console.log('  durationSeconds:', durationSeconds);
      console.log('  metadataURI:', metadataURI);
      console.log('  value:', feeWithBuffer.toString());

      const tx = await this.contract.wrap(
        nftContract,
        tokenId,
        renterAddress,
        durationSeconds,
        metadataURI,
        {
          value: feeWithBuffer
        }
      );

      console.log('Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt.hash);
      
      // Extract wId from Wrapped event
      const wrappedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.contract!.interface.parseLog(log);
          return parsed?.name === 'Wrapped';
        } catch {
          return false;
        }
      });

      if (wrappedEvent) {
        const parsed = this.contract.interface.parseLog(wrappedEvent);
        console.log('Wrapped event found, wId:', parsed?.args.wId.toString());
        return {
          wId: parsed?.args.wId.toString(),
          transactionHash: receipt.hash
        };
      }

      return {
        wId: null,
        transactionHash: receipt.hash
      };
    } catch (error: any) {
      console.error('Wrap transaction error:', error);
      
      // Parse specific error messages
      if (error.message?.includes('insufficient fee')) {
        throw new Error('Insufficient fee provided. Please try again.');
      }
      if (error.message?.includes('ERC721InsufficientApproval') || error.data?.includes('7e273289')) {
        throw new Error('The NFT is not approved for the Wrapped Leasing contract. Please approve it first.');
      }
      if (error.message?.includes('ERC721IncorrectOwner') || error.message?.includes('caller is not token owner')) {
        throw new Error('You do not own this NFT or ownership changed.');
      }
      if (error.message?.includes('invalid renter')) {
        throw new Error('Invalid renter address provided.');
      }
      if (error.message?.includes('duration>0')) {
        throw new Error('Duration must be greater than 0.');
      }
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        throw new Error('Transaction was rejected by user.');
      }
      if (error.message?.includes('missing revert data') || error.code === 'CALL_EXCEPTION') {
        // Try to get more specific error
        throw new Error('Transaction failed. Please verify: 1) You own the NFT, 2) NFT is approved for WrappedLeasing contract, 3) Wallet has sufficient ETH for gas + fees.');
      }
      
      throw error;
    }
  }

  /**
   * Unwrap a wrapped NFT to get back the original
   * @param wId - Wrapped NFT ID
   */
  async unwrapNFT(wId: string) {
    if (!this.contract) throw new Error('Service not initialized');

    const tx = await this.contract.unwrap(wId);
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: receipt.hash
    };
  }

  /**
   * Get details of a wrapped NFT
   * @param wId - Wrapped NFT ID
   */
  async getWrappedInfo(wId: string) {
    if (!this.contract) throw new Error('Service not initialized');

    const info = await this.contract.getWrapped(wId);
    
    return {
      originalNft: info.originalNft,
      originalTokenId: info.originalTokenId.toString(),
      owner: info.owner,
      validUntil: Number(info.validUntil),
      active: info.active
    };
  }

  /**
   * Get lease status (active and time remaining)
   * @param wId - Wrapped NFT ID
   */
  async getLeaseStatus(wId: string) {
    if (!this.contract) throw new Error('Service not initialized');

    const status = await this.contract.getLeaseStatus(wId);
    
    return {
      isActive: status.isActive,
      timeRemaining: Number(status.timeRemaining) // in seconds
    };
  }

  /**
   * Get wrapped counter (total wrapped NFTs created)
   */
  async getWCounter() {
    if (!this.contract) throw new Error('Service not initialized');
    const counter = await this.contract.wCounter();
    return Number(counter);
  }

  /**
   * Approve NFT for wrapping
   * @param nftContract - Address of NFT contract
   * @param tokenId - Token ID to approve
   */
  async approveNFTForWrapping(nftContract: string, tokenId: string) {
    if (!this.signer) throw new Error('Signer not available');

    console.log('=== Approving NFT for Wrapping ===');
    console.log('NFT Contract:', nftContract);
    console.log('Token ID:', tokenId);
    console.log('WrappedLeasing Address:', this.contractAddress);

    const nftAbi = [
      'function approve(address to, uint256 tokenId) public',
      'function getApproved(uint256 tokenId) public view returns (address)',
      'function isApprovedForAll(address owner, address operator) public view returns (bool)',
      'function setApprovalForAll(address operator, bool approved) public',
      'function ownerOf(uint256 tokenId) public view returns (address)'
    ];

    const nftContractInstance = new ethers.Contract(nftContract, nftAbi, this.signer);
    const signerAddress = await this.signer.getAddress();

    // Step 1: Verify ownership
    let owner: string;
    try {
      owner = await nftContractInstance.ownerOf(tokenId);
      console.log('Token owner:', owner);
      console.log('Signer:', signerAddress);
      
      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`You don't own this NFT. The owner is ${owner.slice(0, 6)}...${owner.slice(-4)}`);
      }
    } catch (error: any) {
      if (error.message?.includes("don't own")) throw error;
      if (error.message?.includes('ERC721NonexistentToken') || error.code === 'CALL_EXCEPTION') {
        throw new Error(`Token ID ${tokenId} does not exist in this contract.`);
      }
      console.error('Ownership check failed:', error);
      throw new Error('Failed to verify NFT ownership. Please check the contract address and token ID.');
    }

    // Step 2: Check if already approved
    try {
      const currentApproval = await nftContractInstance.getApproved(tokenId);
      console.log('Current approval:', currentApproval);
      
      if (currentApproval.toLowerCase() === this.contractAddress.toLowerCase()) {
        console.log('NFT already approved for wrapping');
        return true;
      }

      const approvedForAll = await nftContractInstance.isApprovedForAll(signerAddress, this.contractAddress);
      console.log('ApprovedForAll:', approvedForAll);
      
      if (approvedForAll) {
        console.log('NFT already approved (approvedForAll)');
        return true;
      }
    } catch (error) {
      console.log('Could not check current approval, proceeding with approve...');
    }

    // Step 3: Execute approval transaction
    try {
      console.log('Sending approval transaction...');
      const tx = await nftContractInstance.approve(this.contractAddress, tokenId);
      console.log('Approval transaction sent:', tx.hash);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Approval transaction confirmed:', receipt.hash);
      
      // Wait a moment for the state to be reflected
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 4: Verify approval was successful
      try {
        const newApproval = await nftContractInstance.getApproved(tokenId);
        console.log('New approval after transaction:', newApproval);
        
        if (newApproval.toLowerCase() !== this.contractAddress.toLowerCase()) {
          console.warn('Approval transaction confirmed but approval not reflected yet');
          // Don't throw error - the transaction was confirmed so it should be fine
        }
      } catch (verifyError) {
        console.log('Could not verify approval, but transaction was confirmed');
      }
      
      return true;
    } catch (error: any) {
      console.error('Approval error:', error);
      
      // Parse common errors
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        throw new Error('Approval transaction was rejected by user.');
      }
      if (error.message?.includes('ERC721NonexistentToken') || error.data?.includes('7e273289')) {
        throw new Error(`Token ID ${tokenId} does not exist. Please check the token ID.`);
      }
      if (error.message?.includes('ERC721InvalidApprover') || error.message?.includes('not owner')) {
        throw new Error(`You do not own Token ID ${tokenId}. Only the owner can approve.`);
      }
      if (error.message?.includes('insufficient funds') || error.code === 'INSUFFICIENT_FUNDS') {
        throw new Error('Insufficient funds to pay for gas.');
      }
      
      throw error;
    }
  }

  /**
   * Check if NFT is approved for wrapping
   */
  async isNFTApproved(nftContract: string, tokenId: string, ownerAddress: string) {
    if (!this.signer) throw new Error('Signer not available');

    const nftAbi = [
      'function getApproved(uint256 tokenId) public view returns (address)',
      'function isApprovedForAll(address owner, address operator) public view returns (bool)'
    ];

    const provider = this.signer.provider;
    const nftContractInstance = new ethers.Contract(nftContract, nftAbi, provider!);
    
    try {
      const approved = await nftContractInstance.getApproved(tokenId);
      if (approved.toLowerCase() === this.contractAddress.toLowerCase()) {
        return true;
      }

      const approvedForAll = await nftContractInstance.isApprovedForAll(
        ownerAddress,
        this.contractAddress
      );
      return approvedForAll;
    } catch (error) {
      console.error('Error checking approval:', error);
      return false;
    }
  }

  // Get the contract address
  getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Get the current FeeManager address
   */
  async getFeeManagerAddress(): Promise<string> {
    if (!this.contract) throw new Error('Service not initialized');
    return await this.contract.feeManager();
  }

  /**
   * Check if FeeManager is properly configured
   */
  async isFeeManagerConfigured(): Promise<boolean> {
    try {
      const feeManagerAddress = await this.getFeeManagerAddress();
      return feeManagerAddress && feeManagerAddress !== ethers.ZeroAddress;
    } catch {
      return false;
    }
  }

  /**
   * Set the FeeManager address (admin only)
   * @param feeManagerAddress - Address of the FeeManager contract
   */
  async setFeeManager(feeManagerAddress: string): Promise<{ success: boolean; transactionHash: string }> {
    if (!this.contract) throw new Error('Service not initialized');
    if (!this.signer) throw new Error('Signer not available');

    console.log('Setting FeeManager to:', feeManagerAddress);

    try {
      // Call setFeeManager on the WrappedLeasing contract
      const tx = await this.contract.setFeeManager(feeManagerAddress);
      console.log('setFeeManager transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('setFeeManager transaction confirmed:', receipt.hash);

      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error: any) {
      console.error('Error setting FeeManager:', error);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        throw new Error('Transaction was rejected by user.');
      }
      if (error.message?.includes('AccessControlUnauthorizedAccount') || error.message?.includes('only admin')) {
        throw new Error('Only admin can set the FeeManager. You do not have admin permissions.');
      }
      
      throw error;
    }
  }

  /**
   * Check if the current user has admin role
   */
  async isAdmin(): Promise<boolean> {
    if (!this.contract) {
      console.error('isAdmin: Service not initialized - contract is null');
      return false;
    }
    if (!this.signer) {
      console.error('isAdmin: Signer is null');
      return false;
    }

    try {
      const signerAddress = await this.signer.getAddress();
      console.log('=== isAdmin() Debug ===');
      console.log('Contract Address:', this.contractAddress);
      console.log('Signer Address:', signerAddress);
      
      // ADMIN_ROLE is DEFAULT_ADMIN_ROLE which is bytes32(0)
      const adminRole = '0x0000000000000000000000000000000000000000000000000000000000000000';
      console.log('Calling hasRole with role:', adminRole, );
      
      const result = await this.contract.hasRole(adminRole, signerAddress);
      console.log('hasRole result:', result);
      console.log('=== End isAdmin() Debug ===');
      
      return result;
    } catch (error: any) {
      console.error('=== isAdmin() ERROR ===');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Full error:', error);
      console.error('=== End Error ===');
      return false;
    }
  }
}

export const wrappedLeasingService = new WrappedLeasingService();

