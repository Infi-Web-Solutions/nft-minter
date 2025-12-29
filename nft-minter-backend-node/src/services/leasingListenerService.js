import {
    provider,
    wrappedLeasing,
    leasingMarketplace,
    adminWallet
} from "../lib/contracts.js";
import Listing from '../models/listing.js';
import RentalTransaction from '../models/rentalTransaction.js';
import WrappedNft from '../models/wrappedNft.js';
import Nft from '../models/nft.js';

class LeasingListenerService {
    constructor() {
        this.isListening = false;
    }

    async start() {
        if (this.isListening) return;

        console.log('[LeasingListener] Starting listener service (Polling mode)...');

        try {
            // Get current block to start from
            let lastProcessedBlock = await provider.getBlockNumber();
            console.log(`[LeasingListener] Starting from block ${lastProcessedBlock}`);

            this.isListening = true;

            const pollEvents = async () => {
                if (!this.isListening) return;

                try {
                    const currentBlock = await provider.getBlockNumber();
                    if (currentBlock > lastProcessedBlock) {
                        const fromBlock = lastProcessedBlock + 1;
                        const toBlock = currentBlock;

                        // 1. LeaseListed events
                        const listedEvents = await leasingMarketplace.queryFilter('LeaseListed', fromBlock, toBlock);
                        for (const event of listedEvents) {
                            const [listingId, owner, nft, tokenId, pricePerSecond, minDuration, maxDuration, listingExpiresAt] = event.args;
                            console.log(`[LeasingListener] LeaseListed: ${listingId} for ${nft} #${tokenId}`);
                            await this.handleLeaseListed(listingId, owner, nft, tokenId, pricePerSecond, minDuration, maxDuration, listingExpiresAt, event);
                        }

                        // 2. LeaseCancelled events
                        const cancelledEvents = await leasingMarketplace.queryFilter('LeaseCancelled', fromBlock, toBlock);
                        for (const event of cancelledEvents) {
                            const [listingId] = event.args;
                            console.log(`[LeasingListener] LeaseCancelled: ${listingId}`);
                            await this.handleLeaseCancelled(listingId, event);
                        }

                        // 3. LeaseRented events
                        const rentedEvents = await leasingMarketplace.queryFilter('LeaseRented', fromBlock, toBlock);
                        for (const event of rentedEvents) {
                            const [listingId, renter, wId, rentPaid, depositHeld, expiresAt] = event.args;
                            console.log(`[LeasingListener] LeaseRented: ${listingId} by ${renter}`);
                            await this.handleLeaseRented(listingId, renter, wId, rentPaid, depositHeld, expiresAt, event);
                        }

                        // 4. DepositRefunded events
                        const refundedEvents = await leasingMarketplace.queryFilter('DepositRefunded', fromBlock, toBlock);
                        for (const event of refundedEvents) {
                            const [listingId, to, amount] = event.args;
                            console.log(`[LeasingListener] DepositRefunded: ${listingId} to ${to}`);
                            await this.handleDepositRefunded(listingId, to, amount, event);
                        }

                        // 5. Unwrapped events (WrappedLeasing)
                        const unwrappedEvents = await wrappedLeasing.queryFilter('Unwrapped', fromBlock, toBlock);
                        for (const event of unwrappedEvents) {
                            const [wId] = event.args;
                            console.log(`[LeasingListener] Unwrapped: wId ${wId}`);
                            await this.handleUnwrapped(wId, event);
                        }

                        lastProcessedBlock = toBlock;
                    }
                } catch (err) {
                    console.warn('[LeasingListener] Polling error:', err.message);
                }

                // Poll every 15 seconds
                setTimeout(pollEvents, 15000);
            };

            pollEvents();

        } catch (err) {
            console.error('[LeasingListener] Failed to start listener service:', err);
            this.isListening = false;
        }
    }

    async handleLeaseListed(listingId, owner, nft, tokenId, pricePerSecond, minDuration, maxDuration, listingExpiresAt, event) {
        try {
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
                    listingExpiresAt: listingExpiresAt ? new Date(Number(listingExpiresAt) * 1000) : null,
                    status: 'Active'
                },
                { upsert: true, new: true }
            );

            // Update Nft model status - if listed for rent, it's not for sale and not yet rented
            await Nft.findOneAndUpdate(
                { contract_address: { $regex: new RegExp(`^${nft}$`, 'i') }, token_id: tokenId.toString() },
                { is_rentable: true, is_listed: false, is_rented: false }
            );

            await RentalTransaction.create({
                type: 'Listed',
                listingId: Number(listingId),
                nftAddress: nft,
                tokenId: tokenId.toString(),
                owner: owner,
                pricePerSecond: pricePerSecond.toString(),
                minDuration: Number(minDuration),
                maxDuration: Number(maxDuration),
                expiresAt: listingExpiresAt ? new Date(Number(listingExpiresAt) * 1000) : null,
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        } catch (err) {
            console.error(`[LeasingListener] Error handling LeaseListed ${listingId}:`, err);
        }
    }

    async handleLeaseCancelled(listingId, event) {
        try {
            const listing = await Listing.findOne({ listingId: Number(listingId) });
            await Listing.findOneAndUpdate(
                { listingId: Number(listingId) },
                { status: 'Cancelled' }
            );

            if (listing) {
                // Update Nft model status - clear rental flags
                await Nft.findOneAndUpdate(
                    { contract_address: { $regex: new RegExp(`^${listing.nftAddress}$`, 'i') }, token_id: listing.tokenId },
                    { is_rentable: false, is_listed: false, is_rented: false }
                );

                await RentalTransaction.create({
                    type: 'Cancelled',
                    listingId: Number(listingId),
                    nftAddress: listing.nftAddress,
                    tokenId: listing.tokenId,
                    owner: listing.owner,
                    transactionHash: event.transactionHash,
                    blockNumber: event.blockNumber
                });
            }
        } catch (err) {
            console.error(`[LeasingListener] Error handling LeaseCancelled ${listingId}:`, err);
        }
    }

    async handleLeaseRented(listingId, renter, wId, rentPaid, depositHeld, expiresAt, event) {
        try {
            const listing = await Listing.findOne({ listingId: Number(listingId) });
            await Listing.findOneAndUpdate(
                { listingId: Number(listingId) },
                {
                    status: 'Rented',
                    rentedBy: renter,
                    rentalExpiresAt: new Date(Number(expiresAt) * 1000)
                }
            );

            if (listing) {
                // Update Nft model status - rented NFTs are not rentable until relisted/finished, and not for sale. Mark as rented.
                await Nft.findOneAndUpdate(
                    { contract_address: { $regex: new RegExp(`^${listing.nftAddress}$`, 'i') }, token_id: listing.tokenId },
                    { is_rentable: false, is_listed: false, is_rented: true }
                );

                await RentalTransaction.create({
                    type: 'Rented',
                    listingId: Number(listingId),
                    nftAddress: listing.nftAddress,
                    tokenId: listing.tokenId,
                    owner: listing.owner,
                    renter: renter,
                    pricePerSecond: listing.pricePerSecond,
                    rentAmount: rentPaid.toString(),
                    depositAmount: depositHeld.toString(),
                    expiresAt: new Date(Number(expiresAt) * 1000),
                    wrappedTokenId: Number(wId),
                    transactionHash: event.transactionHash,
                    blockNumber: event.blockNumber
                });

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
                        status: 'Active',
                        transactionHash: event.transactionHash
                    });
                } catch (wrapErr) {
                    if (wrapErr.code !== 11000) console.error(`[LeasingListener] Error creating WrappedNft:`, wrapErr);
                }
            }
        } catch (err) {
            console.error(`[LeasingListener] Error handling LeaseRented ${listingId}:`, err);
        }
    }

    async handleDepositRefunded(listingId, to, amount, event) {
        try {
            const listing = await Listing.findOne({ listingId: Number(listingId) });
            await RentalTransaction.create({
                type: 'DepositRefunded',
                listingId: Number(listingId),
                nftAddress: listing?.nftAddress || '',
                tokenId: listing?.tokenId || '',
                renter: to,
                depositAmount: amount.toString(),
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        } catch (err) {
            console.error(`[LeasingListener] Error handling DepositRefunded ${listingId}:`, err);
        }
    }

    async handleUnwrapped(wId, event) {
        try {
            const numericWId = Number(wId);
            const wrapped = await WrappedNft.findOneAndUpdate(
                { wId: numericWId },
                { status: 'Unwrapped', updatedAt: new Date() },
                { new: true }
            );

            if (wrapped) {
                const listing = await Listing.findOne({
                    nftAddress: { $regex: new RegExp(`^${wrapped.originalNftContract}$`, 'i') },
                    tokenId: wrapped.originalTokenId,
                    status: 'Rented'
                }).sort({ updatedAt: -1 });

                if (listing) {
                    const now = Math.floor(Date.now() / 1000);
                    const minDuration = Number(listing.minDuration);
                    const listingExpiresAt = listing.listingExpiresAt ? Math.floor(listing.listingExpiresAt.getTime() / 1000) : 0;

                    let finalizedStatus = 'Finished';

                    if (listingExpiresAt > now + minDuration) {
                        try {
                            const relistTx = await leasingMarketplace.connect(adminWallet).relistRemaining(listing.listingId);
                            await relistTx.wait();
                            const onChainListing = await leasingMarketplace.listings(listing.listingId);
                            if (onChainListing && Number(onChainListing.status) === 1) {
                                finalizedStatus = 'Active';
                            }
                        } catch (relistErr) {
                            console.error(`[LeasingListener] Relist error for ${listing.listingId}:`, relistErr.message);
                        }
                    }

                    await Listing.findByIdAndUpdate(listing._id, {
                        status: finalizedStatus,
                        rentedBy: null,
                        rentalExpiresAt: null,
                        updatedAt: new Date()
                    });

                    // Update Nft model status based on final listing state
                    await Nft.findOneAndUpdate(
                        { contract_address: { $regex: new RegExp(`^${wrapped.originalNftContract}$`, 'i') }, token_id: wrapped.originalTokenId },
                        { is_rentable: finalizedStatus === 'Active', is_listed: false, is_rented: false }
                    );
                }
            }
        } catch (err) {
            console.error(`[LeasingListener] Error handling Unwrapped ${wId}:`, err);
        }
    }

    stop() {
        this.isListening = false;
        console.log('[LeasingListener] Listener service stopped');
    }
}

export const leasingListenerService = new LeasingListenerService();
