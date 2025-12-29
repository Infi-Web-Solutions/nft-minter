import { ethers } from 'ethers';
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
        this.checkExpiredListings();

        // Then interval
        this.intervalId = setInterval(() => {
            this.checkExpiredUser();
            this.checkExpiredListings();
        }, this.checkInterval);
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
            // Check admin wallet balance
            const balance = await adminWallet.provider.getBalance(adminWallet.address);
            const balanceEth = parseFloat(ethers.formatEther(balance)).toFixed(4);
            console.log(`[ExpirationService] Admin Wallet: ${adminWallet.address} Balance: ${balanceEth} ETH`);

            // 0. Update expired statuses in DB
            await WrappedNft.updateExpiredStatuses();

            // Find wNFTs that have passed their validUntil time but are not yet Unwrapped
            const now = new Date();

            const expiredNfts = await WrappedNft.find({
                status: { $in: ['Active', 'Expired'] },
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
            if (!status.isActive) {
                console.log(`[ExpirationService] wId ${nftDoc.wId} is already inactive on-chain. Updating DB.`);
                nftDoc.status = 'Unwrapped';
                await nftDoc.save();
                return;
            }

            if (status.timeRemaining > 0) {
                console.warn(`[ExpirationService] wId ${nftDoc.wId} still has ${status.timeRemaining}s remaining. Skipping.`);
                return;
            }

            // Call unwrap
            try {
                const tx = await contractWithSigner.unwrap(nftDoc.wId);
                console.log(`Unwrap tx sent for wId ${nftDoc.wId}: ${tx.hash}`);
                await tx.wait();
                console.log(`Unwrap confirmed for wId ${nftDoc.wId}`);

                // Update DB
                nftDoc.status = 'Unwrapped';
                await nftDoc.save();
            } catch (txError) {
                if (txError.message.includes('not active')) {
                    console.log(`[ExpirationService] wId ${nftDoc.wId} already unwrapped (caught during tx). Updating DB.`);
                    nftDoc.status = 'Unwrapped';
                    await nftDoc.save();
                } else {
                    throw txError; // Re-throw other errors (like 'lease expired')
                }
            }

            // Also Delist from Marketplace if it was listed there
            try {
                // 1. Check if the original NFT listing needs update (Finalizing/Relisting)
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

                // 2. IMPORTANT: If this wId itself was listed for sub-lease, cancel those listings too!
                const wLeasingAddr = process.env.WrappedLeasing_Address;
                if (wLeasingAddr) {
                    const subListings = await Listing.find({
                        nftAddress: { $regex: new RegExp(`^${wLeasingAddr}$`, 'i') },
                        tokenId: nftDoc.wId.toString(),
                        status: { $in: ['Active', 'Rented'] }
                    });

                    if (subListings.length > 0) {
                        console.log(`[ExpirationService] Found ${subListings.length} sub-listings for expired wId ${nftDoc.wId}. Cancelling...`);
                        for (const sl of subListings) {
                            sl.status = 'Finished'; // or 'Cancelled'
                            sl.updatedAt = new Date();
                            await sl.save();
                        }
                    }
                }

                // 3. IMPORTANT: If this wId was sub-leased (wwnft created), those sub-wNFTs must also disappear!
                if (wLeasingAddr) {
                    const subWrappedNfts = await WrappedNft.find({
                        originalNftContract: { $regex: new RegExp(`^${wLeasingAddr}$`, 'i') },
                        originalTokenId: nftDoc.wId.toString(),
                        status: 'Active'
                    });

                    if (subWrappedNfts.length > 0) {
                        console.log(`[ExpirationService] Found ${subWrappedNfts.length} sub-wNFTs for expired wId ${nftDoc.wId}. Marking as Expired...`);
                        for (const swnft of subWrappedNfts) {
                            swnft.status = 'Expired';
                            swnft.updatedAt = new Date();
                            await swnft.save();

                            // Optionally trigger unwrap for the sub-wNFT too if possible, 
                            // though marking it Expired will hide it from UI immediately.
                        }
                    }
                }

            } catch (listErr) {
                console.error('[ExpirationService] Error delisting associated listings:', listErr);
            }

        } catch (error) {
            console.error(`Failed to auto-unwrap wId ${nftDoc.wId}:`, error.message);
        }
    }

    async checkExpiredListings() {
        try {
            const now = new Date();
            // Find Active listings that have reached their listingExpiresAt
            const expiredListings = await Listing.find({
                status: 'Active',
                listingExpiresAt: { $lt: now }
            });

            if (expiredListings.length === 0) return;

            console.log(`[ExpirationService] Found ${expiredListings.length} expired listings window pending finish...`);

            const marketplaceWithSigner = leasingMarketplace.connect(adminWallet);

            for (const listing of expiredListings) {
                try {
                    console.log(`[ExpirationService] Finishing expired listing window for ID ${listing.listingId}...`);

                    // Verify on-chain status first
                    const onChainListing = await marketplaceWithSigner.listings(listing.listingId);
                    if (Number(onChainListing.status) !== 1) { // 1 = Active
                        console.log(`[ExpirationService] Listing ${listing.listingId} is not Active on-chain. Updating DB.`);
                        listing.status = 'Finished';
                        await listing.save();
                        continue;
                    }

                    // Call finishExpiredListing
                    const tx = await marketplaceWithSigner.finishExpiredListing(listing.listingId);
                    console.log(`[ExpirationService] Finish tx sent for listing ${listing.listingId}: ${tx.hash}`);
                    await tx.wait();

                    listing.status = 'Finished';
                    await listing.save();
                    console.log(`[ExpirationService] Listing ${listing.listingId} finished successfully.`);
                } catch (listingErr) {
                    console.error(`[ExpirationService] Failed to finish listing ${listing.listingId}:`, listingErr.message);
                }
            }
        } catch (err) {
            console.error('[ExpirationService] Error in checkExpiredListings:', err);
        }
    }
}

const expirationService = new ExpirationService();
export default expirationService;
