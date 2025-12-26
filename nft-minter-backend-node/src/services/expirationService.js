import {
    wrappedLeasing,
    leasingMarketplace,
    adminWallet
} from "../lib/contracts.js";
import WrappedNft from '../models/wrappedNft.js';
import Listing from '../models/listing.js';

class ExpirationService {
    constructor() {
        this.isRunning = false;
        this.checkInterval = 60 * 1000; // Check every 1 minute
        this.intervalId = null;
    }

    async initialize() {
        console.log('Expiration Service initialized');
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`Expiration Service checked every ${this.checkInterval}ms`);

        // Run immediately
        this.checkExpiredUser();

        // Then interval
        this.intervalId = setInterval(() => this.checkExpiredUser(), this.checkInterval);
    }

    stop() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async checkExpiredUser() {
        try {
            // Find active wNFTs that have passed their validUntil time
            // Add a small buffer (e.g. 10 seconds) to ensure block time is definitely past
            const now = Math.floor(Date.now() / 1000);

            const expiredNfts = await WrappedNft.find({
                status: 'Active',
                validUntil: { $lt: now }
            });

            if (expiredNfts.length === 0) return;

            console.log(`Found ${expiredNfts.length} expired wNFTs pending unwrap...`);

            // Process each one
            for (const nft of expiredNfts) {
                await this.processUnwrap(nft);
            }

        } catch (error) {
            console.error('Error in ExpirationService check:', error);
        }
    }

    async processUnwrap(nftDoc) {
        try {
            console.log(`Auto-unwrapping wNFT #${nftDoc.wId}...`);

            // Connect with admin/executor wallet (must have ETH for gas)
            const contractWithSigner = wrappedLeasing.connect(adminWallet);

            // Double check on-chain status to avoid reverts
            const status = await contractWithSigner.getLeaseStatus(nftDoc.wId);
            if (!status.isActive || status.timeRemaining > 0) {
                console.warn(`Skipping wId ${nftDoc.wId}: On-chain status mismatch (Active: ${status.isActive}, Time: ${status.timeRemaining})`);
                // If on-chain says inactive, update DB to match
                if (!status.isActive) {
                    nftDoc.status = 'Unwrapped'; // or 'Expired'
                    await nftDoc.save();
                }
                return;
            }

            // Call unwrap
            // Since lease is expired, anyone can call this (public)
            const tx = await contractWithSigner.unwrap(nftDoc.wId);
            console.log(`Unwrap tx sent for wId ${nftDoc.wId}: ${tx.hash}`);

            await tx.wait();
            console.log(`Unwrap confirmed for wId ${nftDoc.wId}`);

            // Update DB
            nftDoc.status = 'Unwrapped';
            await nftDoc.save();

            // Also Delist from Marketplace if it was listed there
            try {
                const listing = await Listing.findOne({
                    nftAddress: { $regex: new RegExp(`^${nftDoc.originalNftContract}$`, 'i') },
                    tokenId: nftDoc.originalTokenId,
                    status: 'Rented'
                }).sort({ updatedAt: -1 });

                if (listing) {
                    const maxSecs = Number(listing.maxDuration);
                    const usedSecs = Number(nftDoc.durationSeconds);
                    const remaining = maxSecs > usedSecs ? maxSecs - usedSecs : 0;

                    // Try to relist on-chain
                    let finalizedStatus = 'Finished';
                    let newMaxDuration = remaining;

                    if (remaining > 0) {
                        try {
                            const relistTx = await leasingMarketplace.connect(adminWallet).relistRemaining(listing.listingId);
                            await relistTx.wait();

                            // Check finalized status on-chain
                            const onChainListing = await leasingMarketplace.listings(listing.listingId);
                            const statusNum = Number(onChainListing.status);

                            if (statusNum === 1) finalizedStatus = 'Active';
                            else if (statusNum === 4) finalizedStatus = 'Finished';

                            newMaxDuration = Number(onChainListing.maxDuration);
                            console.log(`[ExpirationService] Relisted listing ${listing.listingId}. On-chain status: ${finalizedStatus}`);
                        } catch (relistErr) {
                            console.error(`[ExpirationService] Failed to relist listing ${listing.listingId}:`, relistErr.message);
                            finalizedStatus = 'Finished';
                        }
                    }

                    await Listing.findByIdAndUpdate(listing._id, {
                        status: finalizedStatus,
                        remainingDuration: remaining,
                        maxDuration: finalizedStatus === 'Active' ? newMaxDuration : listing.maxDuration,
                        rentedBy: null,
                        rentalExpiresAt: null,
                        updatedAt: new Date()
                    });
                    console.log(`[ExpirationService] Listing status set to ${finalizedStatus} for wId ${nftDoc.wId}. Remaining: ${remaining}s`);
                }
            } catch (listErr) {
                console.error('[ExpirationService] Error delisting associated listings:', listErr);
            }

        } catch (error) {
            console.error(`Failed to auto-unwrap wId ${nftDoc.wId}:`, error.message);
        }
    }
}

const expirationService = new ExpirationService();
export default expirationService;
