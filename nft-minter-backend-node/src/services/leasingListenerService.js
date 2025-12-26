import {
    provider,
    wrappedLeasing,
    leasingMarketplace,
    adminWallet
} from "../lib/contracts.js";
import Listing from '../models/listing.js';
import RentalTransaction from '../models/rentalTransaction.js';
import WrappedNft from '../models/wrappedNft.js';

class LeasingListenerService {
    constructor() {
        this.isListening = false;
    }

    async start() {
        if (this.isListening) return;

        console.log('[LeasingListener] Starting listener service...');

        try {
            // Listen for LeaseListed
            leasingMarketplace.on('LeaseListed', async (listingId, owner, nft, tokenId, pricePerSecond, minDuration, maxDuration, event) => {
                console.log(`[LeasingListener] LeaseListed: ${listingId} for ${nft} #${tokenId}`);
                try {
                    // Update listing
                    await Listing.findOneAndUpdate(
                        { listingId: Number(listingId) },
                        {
                            listingId: Number(listingId),
                            nftAddress: nft,
                            tokenId: tokenId.toString(),
                            owner: owner,
                            pricePerSecond: pricePerSecond.toString(),
                            minDuration: Number(minDuration),
                            maxDuration: Number(maxDuration),
                            status: 'Active'
                        },
                        { upsert: true, new: true }
                    );

                    // Save transaction history
                    await RentalTransaction.create({
                        type: 'Listed',
                        listingId: Number(listingId),
                        nftAddress: nft,
                        tokenId: tokenId.toString(),
                        owner: owner,
                        pricePerSecond: pricePerSecond.toString(),
                        minDuration: Number(minDuration),
                        maxDuration: Number(maxDuration),
                        transactionHash: event.log?.transactionHash || event.transactionHash,
                        blockNumber: event.log?.blockNumber || event.blockNumber
                    });

                    console.log(`[LeasingListener] Saved listing ${listingId} with transaction history`);
                } catch (err) {
                    console.error(`[LeasingListener] Error saving listing ${listingId}:`, err);
                }
            });

            // Listen for LeaseCancelled
            leasingMarketplace.on('LeaseCancelled', async (listingId, event) => {
                console.log(`[LeasingListener] LeaseCancelled: ${listingId}`);
                try {
                    // Get listing details before updating
                    const listing = await Listing.findOne({ listingId: Number(listingId) });

                    // Update listing
                    await Listing.findOneAndUpdate(
                        { listingId: Number(listingId) },
                        { status: 'Cancelled' }
                    );

                    // Save transaction history
                    if (listing) {
                        await RentalTransaction.create({
                            type: 'Cancelled',
                            listingId: Number(listingId),
                            nftAddress: listing.nftAddress,
                            tokenId: listing.tokenId,
                            owner: listing.owner,
                            transactionHash: event.log?.transactionHash || event.transactionHash,
                            blockNumber: event.log?.blockNumber || event.blockNumber
                        });
                    }

                    console.log(`[LeasingListener] Cancelled listing ${listingId}`);
                } catch (err) {
                    console.error(`[LeasingListener] Error cancelling listing ${listingId}:`, err);
                }
            });

            // Listen for LeaseRented
            leasingMarketplace.on('LeaseRented', async (listingId, renter, wId, rentPaid, depositHeld, expiresAt, event) => {
                console.log(`[LeasingListener] LeaseRented: ${listingId} by ${renter}`);
                try {
                    // Get listing details
                    const listing = await Listing.findOne({ listingId: Number(listingId) });

                    // Update listing
                    await Listing.findOneAndUpdate(
                        { listingId: Number(listingId) },
                        {
                            status: 'Rented',
                            rentedBy: renter,
                            rentalExpiresAt: new Date(Number(expiresAt) * 1000)
                        }
                    );

                    // Save transaction history
                    await RentalTransaction.create({
                        type: 'Rented',
                        listingId: Number(listingId),
                        nftAddress: listing?.nftAddress || '',
                        tokenId: listing?.tokenId || '',
                        owner: listing?.owner || '',
                        renter: renter,
                        pricePerSecond: listing?.pricePerSecond || '0',
                        rentAmount: rentPaid.toString(),
                        depositAmount: depositHeld.toString(),
                        expiresAt: new Date(Number(expiresAt) * 1000),
                        wrappedTokenId: Number(wId),
                        transactionHash: event.log?.transactionHash || event.transactionHash,
                        blockNumber: event.log?.blockNumber || event.blockNumber
                    });

                    // Create WrappedNft record
                    if (listing) {
                        try {
                            const now = Math.floor(Date.now() / 1000);
                            const duration = Number(expiresAt) - now;

                            await WrappedNft.create({
                                wId: Number(wId),
                                originalNftContract: listing.nftAddress,
                                originalTokenId: listing.tokenId,
                                owner: listing.owner,
                                renter: renter,
                                validUntil: new Date(Number(expiresAt) * 1000),
                                durationSeconds: duration > 0 ? duration : 0,
                                feePaid: '0', // Marketplace handles fees differently
                                transactionHash: event.log?.transactionHash || event.transactionHash,
                                status: 'Active'
                            });
                            console.log(`[LeasingListener] Created WrappedNft record for wId ${wId}`);
                        } catch (wrapErr) {
                            // Ignore duplicate key error if it was already created by other means
                            if (wrapErr.code !== 11000) {
                                console.error(`[LeasingListener] Error creating WrappedNft record:`, wrapErr);
                            }
                        }
                    }

                    console.log(`[LeasingListener] Updated listing ${listingId} as Rented with transaction history`);
                } catch (err) {
                    console.error(`[LeasingListener] Error updating rented listing ${listingId}:`, err);
                }
            });

            // Listen for DepositRefunded
            leasingMarketplace.on('DepositRefunded', async (listingId, to, amount, event) => {
                console.log(`[LeasingListener] DepositRefunded: ${listingId} to ${to}`);
                try {
                    const listing = await Listing.findOne({ listingId: Number(listingId) });

                    await RentalTransaction.create({
                        type: 'DepositRefunded',
                        listingId: Number(listingId),
                        nftAddress: listing?.nftAddress || '',
                        tokenId: listing?.tokenId || '',
                        renter: to,
                        depositAmount: amount.toString(),
                        transactionHash: event.log?.transactionHash || event.transactionHash,
                        blockNumber: event.log?.blockNumber || event.blockNumber
                    });

                    console.log(`[LeasingListener] Deposit refunded for listing ${listingId}`);
                } catch (err) {
                    console.error(`[LeasingListener] Error logging deposit refund ${listingId}:`, err);
                }
            });

            // Listen for ProceedsWithdrawn
            leasingMarketplace.on('ProceedsWithdrawn', async (to, amount, event) => {
                console.log(`[LeasingListener] ProceedsWithdrawn: ${amount} to ${to}`);
                try {
                    await RentalTransaction.create({
                        type: 'Withdrawn',
                        listingId: 0,
                        nftAddress: '',
                        tokenId: '',
                        owner: to,
                        rentAmount: amount.toString(),
                        transactionHash: event.log?.transactionHash || event.transactionHash,
                        blockNumber: event.log?.blockNumber || event.blockNumber
                    });

                    console.log(`[LeasingListener] Withdrawal recorded for ${to}`);
                } catch (err) {
                    console.error(`[LeasingListener] Error logging withdrawal:`, err);
                }
            });

            // Listen for Unwrapped (from WrappedLeasing contract)
            wrappedLeasing.on('Unwrapped', async (wId, event) => {
                console.log(`[LeasingListener] Unwrapped: wId ${wId}`);
                try {
                    const numericWId = Number(wId);

                    // 1. Update WrappedNft status
                    const wrapped = await WrappedNft.findOneAndUpdate(
                        { wId: numericWId },
                        { status: 'Unwrapped', updatedAt: new Date() },
                        { new: true }
                    );

                    // 2. Delist from marketplace
                    if (wrapped) {
                        const listing = await Listing.findOne({
                            nftAddress: { $regex: new RegExp(`^${wrapped.originalNftContract}$`, 'i') },
                            tokenId: wrapped.originalTokenId,
                            status: 'Rented'
                        }).sort({ updatedAt: -1 });

                        if (listing) {
                            const maxSecs = Number(listing.maxDuration);
                            const usedSecs = Number(wrapped.durationSeconds);
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
                                    console.log(`[LeasingListener] Relisted listing ${listing.listingId}. On-chain status: ${finalizedStatus}`);
                                } catch (relistErr) {
                                    console.error(`[LeasingListener] Failed to relist listing ${listing.listingId}:`, relistErr.message);
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
                            console.log(`[LeasingListener] Listing status set to ${newStatus} for wId ${wId}. Remaining: ${remaining}s`);
                        }
                    }
                } catch (err) {
                    console.error(`[LeasingListener] Error processing Unwrapped event for wId ${wId}:`, err);
                }
            });

            this.isListening = true;
            console.log('[LeasingListener] Listening for events...');

            // Add global error handler for the provider to catch asynchronous filter errors
            leasingMarketplace.runner.provider.on('error', (error) => {
                console.warn('[LeasingListener] Provider error detected (possible filter loss):', error.message);
                // We don't crash, just log. Ethers usually attempts to recover or we can manually restart if needed.
            });

        } catch (err) {
            console.error('[LeasingListener] Failed to start listener:', err);
            this.isListening = false;
            // Attempt to restart after 10 seconds if it failed to start
            setTimeout(() => this.start(), 10000);
        }
    }
}

export const leasingListenerService = new LeasingListenerService();
