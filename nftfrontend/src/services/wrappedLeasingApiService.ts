
import axios from 'axios';
import { ethers } from 'ethers';

// Use environment variable or default to localhost
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL 
  ? `${(import.meta as any).env.VITE_API_URL}/wrapped-leasing`
  : 'http://localhost:5000/api/wrapped-leasing';

class WrappedLeasingApiService {
  private api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
  });

  private wrappedLeasingContract: ethers.Contract | null = null;

  /**
   * Initialize contract with provider and signer
   */
  async initialize(provider: ethers.Provider, signer: ethers.Signer) {
    try {
      const contractInfo = await this.getContractInfo();
      
      // WrappedLeasing ABI
      const wrappedLeasingAbi = [
        "function wrap(address nftContract, uint256 tokenId, address renterAddress, uint256 durationSeconds, string metadataURI) external payable",
        "function unwrap(uint256 wId) external",
        "function getWrapped(uint256 wId) external view returns (address originalNft, uint256 originalTokenId, address owner, uint256 validUntil, bool active)",
        "function getLeaseStatus(uint256 wId) external view returns (bool isActive, uint256 timeRemaining)",
        "function wCounter() external view returns (uint256)",
        "function feeManager() external view returns (address)",
        "event Wrapped(uint256 indexed wId, address indexed owner, address nft, uint256 tokenId, uint256 validUntil)"
      ];

      this.wrappedLeasingContract = new ethers.Contract(
        contractInfo.wrappedLeasingAddress,
        wrappedLeasingAbi,
        signer
      );
      
      return this.wrappedLeasingContract;
    } catch (error: any) {
      console.error('Initialize contract error:', error.message);
      throw new Error(`Failed to initialize contract: ${error.message}`);
    }
  }

  /**
   * Get contract information
   */
  async getContractInfo() {
    try {
      const response = await this.api.get('/contract-info');
      return response.data;
    } catch (error: any) {
      console.error('Get contract info API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to get contract info');
    }
  }

  /**
   * Validate NFT ownership and approval
   */
  async validateNFT(nftContract: string, tokenId: string, ownerAddress: string) {
    try {
      const response = await this.api.get('/validate-nft', {
        params: { nftContract, tokenId, ownerAddress }
      });
      return response.data;
    } catch (error: any) {
      console.error('Validate NFT API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to validate NFT');
    }
  }

  /**
   * Calculate wrapping fee
   */
  async calculateWrappingFee(durationDays: number) {
    try {
      const response = await this.api.post('/calculate-fee', { durationDays });
      return response.data;
    } catch (error: any) {
      console.error('Calculate fee API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to calculate fee');
    }
  }

  /**
   * Validate wrapping parameters
   */
  async validateWrappingParams(nftContract: string, tokenId: string, renterAddress: string, durationDays: number) {
    try {
      const response = await this.api.post('/validate-wrapping-params', {
        nftContract,
        tokenId,
        renterAddress,
        durationDays
      });
      return response.data;
    } catch (error: any) {
      console.error('Validate wrapping params API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to validate wrapping parameters');
    }
  }


  /**
   * Wrap NFT using user's wallet
   */
  async wrapNFT(
    nftContract: string,
    tokenId: string,
    renterAddress: string,
    durationDays: number
  ) {

    // Auto-initialize if not already done
    if (!this.wrappedLeasingContract) {
      // Check if window.ethereum exists (MetaMask or compatible wallet)
      if (!window.ethereum) {
        throw new Error('No Ethereum wallet found. Please install MetaMask or a compatible wallet.');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      await this.initialize(provider, signer);
    }

    try {
      // First validate all parameters
      const validation = await this.validateWrappingParams(nftContract, tokenId, renterAddress, durationDays);
      
      if (!validation.valid) {
        throw new Error('Invalid wrapping parameters');
      }

      // Convert duration to seconds
      const durationSeconds = Math.floor(durationDays * 24 * 60 * 60);


      // Get current user address
      const runner = this.wrappedLeasingContract!.runner as ethers.Signer;
      const currentAddress = await runner.getAddress();

      // Check if NFT needs approval
      const nftValidation = await this.validateNFT(nftContract, tokenId, currentAddress);
      
      if (nftValidation.needsApproval) {
        throw new Error(`NFT needs approval for WrappedLeasing contract. Please approve first.`);
      }

      // Perform the wrap transaction
      const tx = await this.wrappedLeasingContract!.wrap(
        nftContract,
        tokenId,
        renterAddress,
        durationSeconds,
        "", // metadata URI
        { value: validation.feeWithBufferWei }
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Extract wId and validUntil from event logs
      let wId: string | null = null;
      let validUntil: number = 0;
      for (const log of receipt.logs) {
        try {
          const parsed = this.wrappedLeasingContract!.interface.parseLog(log);
          if (parsed && parsed.name === 'Wrapped') {
            wId = parsed.args.wId.toString();
            validUntil = Number(parsed.args.validUntil);
            break;
          }
        } catch {
          // Skip logs that don't match our ABI
          continue;
        }
      }

      if (!wId) {
        throw new Error('Could not extract wId from transaction receipt');
      }

      // Save to database
      try {
        await this.saveWrappedNFT({
          wId,
          originalNftContract: nftContract,
          originalTokenId: tokenId,
          owner: currentAddress,
          renter: renterAddress,
          validUntil,
          durationSeconds,
          feePaid: validation.feeWithBufferWei,
          transactionHash: receipt.hash
        });
      } catch (dbError) {
        console.error('Failed to save to database (non-blocking):', dbError);
        // Don't fail the wrap if database save fails
      }

      return {
        wId,
        transactionHash: receipt.hash
      };
    } catch (error: any) {
      console.error('Wrap NFT error:', error.message || error);
      throw new Error(error.message || 'Failed to wrap NFT');
    }
  }

  /**
   * Save wrapped NFT to database
   */
  async saveWrappedNFT(data: {
    wId: string;
    originalNftContract: string;
    originalTokenId: string;
    owner: string;
    renter: string;
    validUntil: number;
    durationSeconds: number;
    feePaid: string;
    transactionHash: string;
  }) {
    try {
      const response = await this.api.post('/save', data);
      return response.data;
    } catch (error: any) {
      console.error('Save wrapped NFT API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to save wrapped NFT');
    }
  }

  /**
   * Update wrapped NFT status
   */
  async updateWrappedNFTStatus(wId: string, status: 'Active' | 'Expired' | 'Unwrapped') {
    try {
      const response = await this.api.put(`/status/${wId}`, { status });
      return response.data;
    } catch (error: any) {
      console.error('Update wrapped NFT status API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to update status');
    }
  }

  /**
   * Get user's wrapped NFTs from database
   */
  async getUserWrappedNFTsFromDB(userAddress: string) {
    try {
      const response = await this.api.get(`/user/${userAddress}`);
      return response.data.data || [];
    } catch (error: any) {
      console.error('Get user wrapped NFTs API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to get wrapped NFTs');
    }
  }

  /**
   * Get wrapped NFT info
   */
  async getWrappedInfo(wId: string) {
    try {
      const response = await this.api.get(`/wrapped-info/${wId}`);
      return response.data;
    } catch (error: any) {
      console.error('Get wrapped info API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to get wrapped NFT info');
    }
  }

  /**
   * Get lease status
   */
  async getLeaseStatus(wId: string) {
    try {
      const response = await this.api.get(`/lease-status/${wId}`);
      return response.data;
    } catch (error: any) {
      console.error('Get lease status API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to get lease status');
    }
  }

  /**
   * Check if user can unwrap NFT
   */
  async canUnwrapNFT(wId: string, userAddress: string) {
    try {
      const response = await this.api.get(`/can-unwrap/${wId}`, {
        params: { userAddress }
      });
      return response.data;
    } catch (error: any) {
      console.error('Check unwrap permission API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to check unwrap permission');
    }
  }

  /**
   * Unwrap NFT using user's wallet
   */
  async unwrapNFT(wId: string) {
    if (!this.wrappedLeasingContract) {
      throw new Error('Contract not initialized. Call initialize() first.');
    }

    try {

      const runner = this.wrappedLeasingContract.runner as ethers.Signer;
      const currentAddress = await runner.getAddress();
      
      // Check if user can unwrap
      const canUnwrap = await this.canUnwrapNFT(wId, currentAddress);
      
      if (!canUnwrap.canUnwrap) {
        throw new Error(`Cannot unwrap: ${canUnwrap.error || 'Not authorized or lease still active'}`);
      }

      // Perform the unwrap transaction
      const tx = await this.wrappedLeasingContract.unwrap(wId);
      const receipt = await tx.wait();

      // Update status in database
      try {
        await this.updateWrappedNFTStatus(wId, 'Unwrapped');
      } catch (dbError) {
        console.warn('Failed to update status in DB:', dbError);
      }

      return {
        success: true,
        transactionHash: receipt.transactionHash
      };
    } catch (error: any) {
      console.error('Unwrap NFT error:', error.message || error);
      throw new Error(error.message || 'Failed to unwrap NFT');
    }
  }

  /**
   * Get wrapped counter
   */
  async getWCounter() {
    try {
      const response = await this.api.get('/w-counter');
      return response.data.counter;
    } catch (error: any) {
      console.error('Get wrapped counter API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to get wrapped counter');
    }
  }

  /**
   * Check if FeeManager is configured
   */
  async isFeeManagerConfigured() {
    try {
      const response = await this.api.get('/fee-manager-configured');
      return response.data.configured;
    } catch (error: any) {
      console.error('Check FeeManager API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to check FeeManager configuration');
    }
  }

  /**
   * Set FeeManager address (admin only, uses backend wallet)
   */
  async setFeeManager(feeManagerAddress: string) {
    try {
      const response = await this.api.post('/set-fee-manager', { feeManagerAddress });
      return response.data;
    } catch (error: any) {
      console.error('Set FeeManager API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to set FeeManager');
    }
  }

  /**
   * Validate environment
   */
  async validateEnvironment() {
    try {
      const response = await this.api.get('/validate-environment');
      return response.data;
    } catch (error: any) {
      console.error('Validate environment API error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to validate environment');
    }
  }

  /**
   * Get multiple wrapped NFTs info for a user
   */
  async getUserWrappedNFTs(userAddress: string) {
    try {
      // Try to get from DB first for performance
      try {
        const dbNfts = await this.getUserWrappedNFTsFromDB(userAddress);
        if (dbNfts && dbNfts.length > 0) {
          return dbNfts.map((nft: any) => ({
            wId: nft.wId.toString(),
            originalNft: nft.originalNftContract,
            originalTokenId: nft.originalTokenId,
            owner: nft.owner,
            renter: nft.renter,
            validUntil: new Date(nft.validUntil).getTime() / 1000, // Convert to unix timestamp
            active: nft.status === 'Active',
            isActive: nft.status === 'Active',
            timeRemaining: Math.max(0, Math.floor((new Date(nft.validUntil).getTime() - Date.now()) / 1000))
          }));
        }
      } catch (dbError) {
        console.warn('Failed to get NFTs from DB, falling back to blockchain:', dbError);
      }

      // Fallback to blockchain loop if DB fails or empty (and we suspect there might be some)
      // For now, we'll assume if DB is empty, user has no NFTs, unless we want to force check
      // But since we just deployed new contract, DB should be the source of truth.
      
      const counter = await this.getWCounter();
      const nfts: any[] = [];
      
      // Load last 20 wrapped NFTs for demo
      const start = Math.max(1, counter - 19);
      for (let i = counter; i >= start; i--) {
        try {
          const info = await this.getWrappedInfo(i.toString());
          const status = await this.getLeaseStatus(i.toString());
          
          // Only show NFTs owned by the specified user
          if (info.owner.toLowerCase() === userAddress.toLowerCase()) {
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
      
      return nfts;
    } catch (error: any) {
      console.error('Get user wrapped NFTs API error:', error.message);
      throw new Error('Failed to load wrapped NFTs');
    }
  }

  /**
   * Approve NFT for wrapping
   */
  async approveNFTForWrapping(nftContract: string, tokenId: string) {
    // Auto-initialize if not already done
    if (!this.wrappedLeasingContract) {
      if (!window.ethereum) {
        throw new Error('No Ethereum wallet found. Please install MetaMask or a compatible wallet.');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      await this.initialize(provider, signer);
    }

    try {
      // Simple ERC721 ABI for approval
      const nftAbi = [
        "function approve(address to, uint256 tokenId) external",
        "function getApproved(uint256 tokenId) external view returns (address)",
        "function ownerOf(uint256 tokenId) external view returns (address)"
      ];

      const nft = new ethers.Contract(nftContract, nftAbi, this.wrappedLeasingContract!.runner);
      
      // Get contract addresses
      const contractInfo = await this.getContractInfo();
      const wrappedLeasingAddr = contractInfo.wrappedLeasingAddress;
      
      // Check current approval status
      const approved = await nft.getApproved(tokenId);
      if (approved.toLowerCase() === wrappedLeasingAddr.toLowerCase()) {
        return { alreadyApproved: true };
      }
      
      // Approve the WrappedLeasing contract
      const tx = await nft.approve(wrappedLeasingAddr, tokenId);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        alreadyApproved: false
      };
    } catch (error: any) {
      console.error('Approve NFT error:', error.message || error);
      throw new Error(error.message || 'Failed to approve NFT');
    }
  }
}

export const wrappedLeasingApiService = new WrappedLeasingApiService();
