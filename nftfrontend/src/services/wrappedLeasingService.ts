// Wrapped Leasing Service - Interact with WrappedLeasing smart contract
import { ethers } from 'ethers';
import wrappedLeasingABI from '../contracts/WrappedLeasing.json';

class WrappedLeasingService {
  private contract: ethers.Contract | null = null;
  private signer: ethers.Signer | null = null;

  /**
   * Initialize the service with a provider and signer
   */
  async initialize(provider: ethers.Provider, signer: ethers.Signer) {
    this.signer = signer;
    this.contract = new ethers.Contract(
      import.meta.env.VITE_WRAPPED_LEASING_CONTRACT_ADDRESS,
      wrappedLeasingABI.abi,
      signer
    );
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

    const durationSeconds = durationDays * 24 * 60 * 60;
    
    const tx = await this.contract.wrap(
      nftContract,
      tokenId,
      renterAddress,
      durationSeconds,
      metadataURI,
      {
        value: ethers.parseEther(feeInEth)
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

    const nftAbi = [
      'function approve(address to, uint256 tokenId) public',
      'function isApprovedForAll(address owner, address operator) public view returns (bool)',
      'function setApprovalForAll(address operator, bool approved) public'
    ];

    const nftContractInstance = new ethers.Contract(nftContract, nftAbi, this.signer);
    
    const tx = await nftContractInstance.approve(import.meta.env.VITE_WRAPPED_LEASING_CONTRACT_ADDRESS, tokenId);
    await tx.wait();

    return true;
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
      if (approved.toLowerCase() === import.meta.env.VITE_WRAPPED_LEASING_CONTRACT_ADDRESS.toLowerCase()) {
        return true;
      }

      const approvedForAll = await nftContractInstance.isApprovedForAll(
        ownerAddress,
        import.meta.env.VITE_WRAPPED_LEASING_CONTRACT_ADDRESS      );
      return approvedForAll;
    } catch (error) {
      console.error('Error checking approval:', error);
      return false;
    }
  }
}

export const wrappedLeasingService = new WrappedLeasingService();
