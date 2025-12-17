import { leasingMarketplace } from '../lib/contracts.js';
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

        this.isListening = true;
        console.log('[LeasingListener] Listening for events...');
    } catch (err) {
        console.error('[LeasingListener] Failed to start listener:', err);
    }
  }
}

export const leasingListenerService = new LeasingListenerService();
