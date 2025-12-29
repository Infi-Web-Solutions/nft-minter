import Listing from '../models/listing.js';
import { leasingMarketplace } from '../lib/contracts.js';

export const getActiveListings = async (req, res) => {
    try {
        // 1. Force update expired statuses in DB before fetching
        const wrappedNftModule = await import('../models/wrappedNft.js');
        const WrappedNft = wrappedNftModule.default;
        await WrappedNft.updateExpiredStatuses();

        // 2. Fetch Active and Rented listings
        let listings = await Listing.find({ status: { $in: ['Active', 'Rented'] } }).sort({ createdAt: -1 });

        // 3. Filter out listings of wNFTs that are now Expired/Unwrapped
        // Since getActiveListings is for Marketplace, we want to be sure everything is truly active
        const finalizedListings = [];
        const wLeasingAddr = process.env.WrappedLeasing_Address;

        for (const listing of listings) {
            // If it's a sub-lease (nftAddress is WrappedLeasing)
            if (wLeasingAddr && listing.nftAddress.toLowerCase() === wLeasingAddr.toLowerCase()) {
                const wId = parseInt(listing.tokenId);
                const wNft = await WrappedNft.findOne({ wId });
                if (wNft && wNft.status !== 'Active') {
                    // This wId is no longer Active, so its listing shouldn't be either
                    // Correct the DB status while we're at it
                    listing.status = 'Finished';
                    await listing.save();
                    continue;
                }
            }
            if (listing.status === 'Rented') {
                const wNft = await WrappedNft.findOne({
                    originalNftContract: { $regex: new RegExp(`^${listing.nftAddress}$`, 'i') },
                    originalTokenId: listing.tokenId,
                    status: 'Active'
                }).sort({ wId: -1 });
                if (wNft) {
                    // Create a plain object to add extra properties
                    const listingObj = listing.toObject();
                    listingObj.wId = wNft.wId;
                    finalizedListings.push(listingObj);
                    continue;
                }
            }
            finalizedListings.push(listing);
        }

        return res.json({ success: true, data: finalizedListings });
    } catch (error) {
        console.error('[ListingController] Error fetching active listings:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get listing by NFT address and token ID
 */
export const getListingByNFT = async (req, res) => {
    const { nftAddress, tokenId } = req.params;

    if (!nftAddress || !tokenId) {
        return res.status(400).json({ success: false, error: 'Missing nftAddress or tokenId' });
    }

    try {
        const listing = await Listing.findOne({
            nftAddress: { $regex: new RegExp(`^${nftAddress}$`, 'i') },
            tokenId: tokenId.toString(),
            $or: [
                { status: 'Active' },
                {
                    status: 'Rented',
                    rentalExpiresAt: { $gt: new Date() }
                }
            ]
        });

        if (listing) {
            return res.json({ success: true, data: listing });
        } else {
            return res.json({ success: false, data: null, message: 'No active listing found' });
        }
    } catch (error) {
        console.error('[ListingController] Error fetching listing:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get most recent finished listing for an NFT
 */
export const getFinishedListing = async (req, res) => {
    const { nftAddress, tokenId } = req.params;

    try {
        const listing = await Listing.findOne({
            nftAddress: { $regex: new RegExp(`^${nftAddress}$`, 'i') },
            tokenId: tokenId.toString(),
            status: 'Finished'
        }).sort({ updatedAt: -1 });

        return res.json({ success: true, data: listing });
    } catch (error) {
        console.error('[ListingController] Error fetching finished listing:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Sync listings from blockchain (admin endpoint)
 */
export const syncListingsFromBlockchain = async (req, res) => {
    try {
        console.log('[ListingController] Starting blockchain sync...');

        const counter = await leasingMarketplace.listingCounter();
        const totalListings = Number(counter);
        console.log(`[ListingController] Total listings on chain: ${totalListings}`);

        let synced = 0;
        for (let i = 1; i <= totalListings; i++) {
            try {
                const listing = await leasingMarketplace.listings(i);

                // Check if listing exists (owner is not zero address)
                if (listing.owner === '0x0000000000000000000000000000000000000000') continue;

                // Determine status: 0 = None, 1 = Active, 2 = Rented, 3 = Cancelled
                let status = 'Active';
                if (Number(listing.status) === 2) status = 'Rented';
                if (Number(listing.status) === 3) status = 'Cancelled';
                if (Number(listing.status) === 0) continue; // Skip None status

                await Listing.findOneAndUpdate(
                    { listingId: i },
                    {
                        listingId: i,
                        nftAddress: listing.nft,
                        tokenId: listing.tokenId.toString(),
                        owner: listing.owner,
                        pricePerSecond: listing.pricePerSecond.toString(),
                        minDuration: Number(listing.minDuration),
                        maxDuration: Number(listing.maxDuration),
                        status: status
                    },
                    { upsert: true, new: true }
                );
                synced++;
            } catch (err) {
                console.error(`[ListingController] Error syncing listing ${i}:`, err.message);
            }
        }

        console.log(`[ListingController] Synced ${synced} listings`);
        return res.json({ success: true, message: `Synced ${synced} listings from blockchain` });
    } catch (error) {
        console.error('[ListingController] Error syncing listings:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Create or update a listing (called after frontend transaction)
 */
export const saveListing = async (req, res) => {
    const { listingId, nftAddress, tokenId, owner, pricePerSecond, minDuration, maxDuration, status } = req.body;

    if (!listingId || !nftAddress || !tokenId || !owner) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    try {
        const listingIdParsed = parseInt(listingId);
        const listing = await Listing.findOneAndUpdate(
            { listingId: listingIdParsed },
            {
                listingId: listingIdParsed,
                nftAddress,
                tokenId: tokenId.toString(),
                owner,
                pricePerSecond: pricePerSecond || '0',
                minDuration: minDuration || 0,
                maxDuration: maxDuration || 0,
                status: status || 'Active'
            },
            { upsert: true, new: true }
        );

        // SYNC Nft model status - if listed for rent, it's not for sale (is_listed = false)
        const nftModule = await import('../models/nft.js');
        const Nft = nftModule.default;
        await Nft.findOneAndUpdate(
            { contract_address: { $regex: new RegExp(`^${nftAddress}$`, 'i') }, token_id: tokenId.toString() },
            {
                is_rentable: (status !== 'Cancelled' && status !== 'Finished'),
                is_listed: false // Cannot be for sale while listed for rent
            }
        );

        console.log(`[ListingController] Saved listing ${listingId} and updated Nft rentable status`);
        return res.json({ success: true, data: listing });
    } catch (error) {
        console.error('[ListingController] Error saving listing:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Update listing status
 */
export const updateListingStatus = async (req, res) => {
    const { listingId } = req.params;
    const { status, rentedBy, rentalExpiresAt } = req.body;

    if (!listingId || !status) {
        return res.status(400).json({ success: false, error: 'Missing listingId or status' });
    }

    try {
        const updateData = { status };
        if (rentedBy) updateData.rentedBy = rentedBy;
        if (rentalExpiresAt) updateData.rentalExpiresAt = new Date(rentalExpiresAt);

        const listing = await Listing.findOneAndUpdate(
            { listingId: parseInt(listingId) },
            updateData,
            { new: true }
        );

        if (!listing) {
            return res.status(404).json({ success: false, error: 'Listing not found' });
        }

        // SYNC Nft model status - if rented, it's not rentable anymore
        const nftModule = await import('../models/nft.js');
        const Nft = nftModule.default;
        await Nft.findOneAndUpdate(
            { contract_address: { $regex: new RegExp(`^${listing.nftAddress}$`, 'i') }, token_id: listing.tokenId },
            {
                is_rentable: status === 'Active',
                is_listed: false // Still shouldn't be for sale
            }
        );

        console.log(`[ListingController] Updated listing ${listingId} status to ${status} and synced Nft status`);
        return res.json({ success: true, data: listing });
    } catch (error) {
        console.error('[ListingController] Error updating listing status:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Sync a specific listing from the blockchain
 */
export const syncListing = async (req, res) => {
    const { listingId } = req.params;

    if (!listingId) {
        return res.status(400).json({ success: false, error: 'Missing listingId' });
    }

    try {
        const id = parseInt(listingId);
        const onChainListing = await leasingMarketplace.listings(id);

        if (onChainListing.owner === '0x0000000000000000000000000000000000000000') {
            return res.status(404).json({ success: false, error: 'Listing not found on-chain' });
        }

        // Status mapping: 1=Active, 2=Rented, 3=Cancelled, 4=Completed
        let status = 'Active';
        const sNum = Number(onChainListing.status);
        if (sNum === 2) status = 'Rented';
        if (sNum === 3) status = 'Cancelled';
        if (sNum === 4) status = 'Finished';

        const listing = await Listing.findOneAndUpdate(
            { listingId: id },
            {
                listingId: id,
                nftAddress: onChainListing.nft,
                tokenId: onChainListing.tokenId.toString(),
                owner: onChainListing.owner,
                pricePerSecond: onChainListing.pricePerSecond.toString(),
                minDuration: Number(onChainListing.minDuration),
                maxDuration: Number(onChainListing.maxDuration),
                status,
                updatedAt: new Date()
            },
            { new: true, upsert: true }
        );

        // If Rented, also sync rental info for expiry time
        if (status === 'Rented') {
            const rental = await leasingMarketplace.rentals(id);
            if (rental.wId > 0) {
                listing.rentedBy = rental.renter;
                listing.rentalExpiresAt = new Date(Number(rental.expiresAt) * 1000);
                await listing.save();
            }
        } else {
            // If not rented, clear rental info
            listing.rentedBy = null;
            listing.rentalExpiresAt = null;
            await listing.save();
        }

        console.log(`[ListingController] Synced listing ${id} from blockchain. Status: ${status}`);
        return res.json({ success: true, data: listing });
    } catch (error) {
        console.error('[ListingController] Error syncing listing:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
