import { ethers } from 'ethers';
import { toast } from 'sonner';

const LEASING_MARKETPLACE_ABI = [
  "function listForRent(address nft, uint256 tokenId, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration) external",
  "function rent(uint256 listingId, uint256 durationSeconds) external payable",
  "function getTotalCost(uint256 listingId, uint256 durationSeconds) external view returns (uint256 rentAmount, uint256 deposit, uint256 platformFee, uint256 wrapFee, uint256 totalRequired)",
  "function listings(uint256) external view returns (address owner, address nft, uint256 tokenId, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration, uint8 status)",
  "function rentals(uint256) external view returns (address renter, uint256 wId, uint256 deposit, uint256 rentAmount, uint256 expiresAt)",
  "function pendingBalances(address) external view returns (uint256)",
  "function withdraw() external",
  "function refundDeposit(uint256 listingId) external",
  "function cancelListing(uint256 listingId) external",
  "event LeaseListed(uint256 indexed listingId, address indexed owner, address nft, uint256 tokenId, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration)",
  "event LeaseRented(uint256 indexed listingId, address indexed renter, uint256 wId, uint256 rentPaid, uint256 depositHeld, uint256 expiresAt)",
  "function listingCounter() external view returns (uint256)"
];

const ERC721_ABI = [
  "function approve(address to, uint256 tokenId) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function getApproved(uint256 tokenId) external view returns (address)"
];

class LeasingMarketplaceService {
  private contract: ethers.Contract | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;
  private contractAddress: string = import.meta.env.VITE_LEASING_MARKETPLACE_ADDRESS || '';

  async initialize(provider: ethers.BrowserProvider, signer: ethers.JsonRpcSigner) {
    this.provider = provider;
    this.signer = signer;
    if (this.contractAddress) {
        this.contract = new ethers.Contract(this.contractAddress, LEASING_MARKETPLACE_ABI, signer);
    } else {
        console.error("Leasing Marketplace Address not found in env");
    }
  }

  async listForRent(nftAddress: string, tokenId: string, pricePerDay: string, minDays: number, maxDays: number) {
    if (!this.contract || !this.signer) throw new Error("Not initialized");

    // 1. Approve Marketplace to transfer NFT
    const nftContract = new ethers.Contract(nftAddress, ERC721_ABI, this.signer);
    
    // Check specific approval first
    try {
        const approvedAddr = await nftContract.getApproved(tokenId);
        const isApproved = approvedAddr.toLowerCase() === this.contractAddress.toLowerCase();
        
        if (!isApproved) {
            // Check operator approval
            const isOperator = await nftContract.isApprovedForAll(await this.signer.getAddress(), this.contractAddress);
            if (!isOperator) {
                toast.loading("Approving Marketplace...", { id: 'approve' });
                try {
                    const tx = await nftContract.approve(this.contractAddress, tokenId);
                    await tx.wait();
                    toast.dismiss('approve');
                    toast.success("Approved!");
                } catch (e) {
                    toast.dismiss('approve');
                    throw e;
                }
            }
        }
    } catch (e) {
        console.warn("Approval check failed, attempting to approve anyway...", e);
        // If getApproved fails (e.g. non-standard ERC721), try approving anyway
        const tx = await nftContract.approve(this.contractAddress, tokenId);
        await tx.wait();
    }

    // 2. List
    // Calculate price per second: (pricePerDay * 1e18) / 86400
    const pricePerSecond = ethers.parseEther(pricePerDay) / 86400n;
    const minSeconds = minDays * 86400;
    const maxSeconds = maxDays * 86400;

    const tx = await this.contract.listForRent(nftAddress, tokenId, pricePerSecond, minSeconds, maxSeconds);
    return await tx.wait();
  }

  async calculateCost(listingId: number, durationDays: number) {
    if (!this.contract) throw new Error("Not initialized");
    const durationSeconds = durationDays * 86400;
    const result = await this.contract.getTotalCost(listingId, durationSeconds);
    return {
        rentAmount: result.rentAmount,
        deposit: result.deposit,
        platformFee: result.platformFee,
        wrapFee: result.wrapFee,
        totalRequired: result.totalRequired
    };
  }

  async rent(listingId: number, durationDays: number, totalEthCost: bigint) {
    if (!this.contract) throw new Error("Not initialized");
    const durationSeconds = durationDays * 86400;
    
    const tx = await this.contract.rent(listingId, durationSeconds, { value: totalEthCost });
    return await tx.wait();
  }

  async cancelListing(listingId: number) {
    if (!this.contract) throw new Error("Not initialized");
    const tx = await this.contract.cancelListing(listingId);
    return await tx.wait();
  }

  async withdraw() {
    if (!this.contract) throw new Error("Not initialized");
    const tx = await this.contract.withdraw();
    return await tx.wait();
  }

  async refundDeposit(listingId: number) {
    if (!this.contract) throw new Error("Not initialized");
    const tx = await this.contract.refundDeposit(listingId);
    return await tx.wait();
  }

  async getListingDetails(listingId: number) {
    if (!this.contract) throw new Error("Not initialized");
    return await this.contract.listings(listingId);
  }

  async getPendingBalance(address: string) {
    if (!this.contract) throw new Error("Not initialized");
    return await this.contract.pendingBalances(address);
  }

  // Helper to find the latest active listing ID for a given NFT
  async getListingIdForNFT(nftAddress: string, tokenId: string): Promise<number | null> {
    if (!this.contract) throw new Error("Not initialized");
    
    // Filter LeaseListed events - nft and tokenId are NOT indexed, so we must fetch all and filter in JS
    // We can filter by owner if we knew it, but here we just want to find by NFT
    const filter = this.contract.filters.LeaseListed(); 
    const events = await this.contract.queryFilter(filter);
    
    // Filter in JS
    const matchingEvents = events.filter((e: any) => 
        e.args && 
        e.args.nft.toLowerCase() === nftAddress.toLowerCase() && 
        e.args.tokenId.toString() === tokenId.toString()
    );
    
    if (matchingEvents.length === 0) return null;
    
    // Get the latest event
    const latestEvent = matchingEvents[matchingEvents.length - 1];
    // @ts-ignore
    const listingId = Number(latestEvent.args[0]);
    
    // Verify it's still active
    const listing = await this.contract.listings(listingId);
    // Status 1 is Active
    if (listing.status === 1n) {
        return listingId;
    }
    return null;
  }
  // Helper to get rentals for a user
  async getMyRentals(userAddress: string) {
    if (!this.contract) throw new Error("Not initialized");
    
    const filter = this.contract.filters.LeaseRented(null, userAddress);
    const events = await this.contract.queryFilter(filter);
    
    const rentals = [];
    for (const event of events) {
        // @ts-ignore
        const listingId = Number(event.args[0]);
        const rental = await this.contract.rentals(listingId);
        // Check if deposit > 0 (meaning not refunded yet)
        if (rental.deposit > 0n) {
             // Fetch listing details to get NFT info
             const listing = await this.contract.listings(listingId);
             rentals.push({
                 listingId,
                 wId: Number(rental.wId),
                 deposit: rental.deposit,
                 expiresAt: Number(rental.expiresAt),
                 nft: listing.nft,
                 tokenId: Number(listing.tokenId)
             });
        }
    }
    return rentals;
  }

  // Helper to get all active listings (limited to recent for performance)
  async getActiveListings(limit: number = 50) {
    if (!this.contract) return [];
    
    try {
        // @ts-ignore
        const counter = Number(await this.contract.listingCounter());
        const activeListings = [];
        
        const start = Math.max(1, counter - limit + 1);
        
        // Fetch in parallel batches for speed
        const promises = [];
        for (let i = counter; i >= start; i--) {
            promises.push(this.contract.listings(i).then((l: any) => ({ id: i, ...l })));
        }
        
        const results = await Promise.all(promises);
        
        for (const listing of results) {
            console.log(`[LeasingService] Checking listing ${listing.id}: Status=${listing.status}, NFT=${listing.nft}, TokenID=${listing.tokenId}`);
            // Status 1 is Active
            if (listing.status === 1n) {
                activeListings.push({
                    listingId: listing.id,
                    owner: listing.owner,
                    nft: listing.nft,
                    tokenId: listing.tokenId.toString(),
                    pricePerSecond: listing.pricePerSecond,
                    minDuration: Number(listing.minDuration),
                    maxDuration: Number(listing.maxDuration)
                });
            }
        }
        return activeListings;
    } catch (e) {
        console.error("Error fetching active listings", e);
        return [];
    }
  }
}

export const leasingMarketplaceService = new LeasingMarketplaceService();
