// Wrapped Leasing Service - Interact with WrappedLeasing smart contract
import { ethers } from 'ethers';
import wrappedLeasingABI from '../contracts/WrappedLeasing.json';
import { getWrappedLeasingAddress } from './configService';

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
      console.log('FeeManager Address:', feeManagerAddr);
      
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
        console.log('FeeManager address is zero/invalid!');
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

    // Convert to seconds and ensure it's an integer (smart contract requires uint256)
    const durationSeconds = Math.max(1, Math.floor(durationDays * 24 * 60 * 60));
    
    console.log('Wrapping NFT with params:', {
      nftContract,
      tokenId,
      renterAddress,
      durationSeconds,
      metadataURI
    });

    // Use a small fee to cover any potential fee requirements
    // The contract will only take what it needs
    let requiredFee = ethers.parseEther('0.0001'); // Small buffer for fees
    
    try {
      // Try to get the actual fee from FeeManager
      const feeManagerAddress = await this.contract.feeManager();
      console.log('FeeManager address:', feeManagerAddress);
      
      if (feeManagerAddress && feeManagerAddress !== ethers.ZeroAddress) {
        const feeManagerAbi = [
          'function leasingFeeBps() external view returns (uint16)',
          'function calcBps(uint256 amount, uint16 bps) external pure returns (uint256)'
        ];
        const provider = this.signer!.provider;
        const feeManager = new ethers.Contract(feeManagerAddress, feeManagerAbi, provider!);
        
        const leasingFeeBps = await feeManager.leasingFeeBps();
        // Use BigInt for the calculation to avoid floating point issues
        const calculatedFee = await feeManager.calcBps(BigInt(durationSeconds), leasingFeeBps);
        
        console.log(`Leasing fee: ${leasingFeeBps} bps, calculated fee: ${calculatedFee} wei`);
        
        // Use the larger of the calculated fee or the buffer
        if (calculatedFee > requiredFee) {
          requiredFee = calculatedFee;
        }
      }
    } catch (error) {
      console.log('Could not calculate fee from FeeManager, using default fee:', error);
    }

    console.log('Sending transaction with fee:', requiredFee.toString(), 'wei');

    // Call wrap with the required fee
    try {
      const tx = await this.contract.wrap(
        nftContract,
        tokenId,
        renterAddress,
        durationSeconds,
        metadataURI,
        {
          value: requiredFee
        }
      );

      const receipt = await tx.wait();
      
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
      console.error('Wrap error:', error);
      
      // Provide more specific error messages
      if (error.message?.includes('insufficient fee')) {
        throw new Error('Insufficient fee. Please try again with a higher value.');
      }
      if (error.message?.includes('ERC721: caller is not token owner')) {
        throw new Error('You do not own this NFT or the NFT is not approved.');
      }
      if (error.message?.includes('missing revert data') || error.code === 'CALL_EXCEPTION') {
        throw new Error('Transaction failed. Make sure you own the NFT and it is approved for the Wrapped Leasing contract.');
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

    console.log('Approving NFT:', { nftContract, tokenId, wrappedLeasingAddress: this.contractAddress });

    const nftAbi = [
      'function approve(address to, uint256 tokenId) public',
      'function getApproved(uint256 tokenId) public view returns (address)',
      'function isApprovedForAll(address owner, address operator) public view returns (bool)',
      'function setApprovalForAll(address operator, bool approved) public',
      'function ownerOf(uint256 tokenId) public view returns (address)'
    ];

    const nftContractInstance = new ethers.Contract(nftContract, nftAbi, this.signer);
    const signerAddress = await this.signer.getAddress();

    // Check who owns the token
    try {
      const owner = await nftContractInstance.ownerOf(tokenId);
      console.log('Token owner:', owner, 'Signer:', signerAddress);
      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`You don't own this token. Owner is ${owner}`);
      }
    } catch (error: any) {
      if (error.message.includes("don't own")) throw error;
      console.log('Could not check ownership:', error.message);
    }

    // Check if already approved first
    try {
      const currentApproval = await nftContractInstance.getApproved(tokenId);
      console.log('Current approval:', currentApproval, 'Expected:', this.contractAddress);
      if (currentApproval.toLowerCase() === this.contractAddress.toLowerCase()) {
        console.log('NFT already approved for wrapping');
        return true;
      }

      const approvedForAll = await nftContractInstance.isApprovedForAll(signerAddress, this.contractAddress);
      if (approvedForAll) {
        console.log('NFT already approved (approvedForAll)');
        return true;
      }
    } catch (error) {
      console.log('Could not check current approval, proceeding with approve...');
    }

    // Try to approve
    try {
      const tx = await nftContractInstance.approve(this.contractAddress, tokenId);
      await tx.wait();
      return true;
    } catch (error: any) {
      console.error('Approval error:', error);
      
      // Parse common errors
      if (error.message?.includes('ERC721NonexistentToken') || error.data?.includes('7e273289')) {
        throw new Error(`Token ID ${tokenId} does not exist. Please check the token ID.`);
      }
      if (error.message?.includes('ERC721InvalidApprover') || error.message?.includes('not owner')) {
        throw new Error(`You do not own Token ID ${tokenId}. Only the owner can approve.`);
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
}

export const wrappedLeasingService = new WrappedLeasingService();
