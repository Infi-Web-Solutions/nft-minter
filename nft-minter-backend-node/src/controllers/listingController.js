import Listing from '../models/listing.js';
import { leasingMarketplace } from '../lib/contracts.js';

/**
 * Get all active listings
 */
export const getActiveListings = async (req, res) => {
    try {
        const listings = await Listing.find({ status: { $in: ['Active', 'Rented'] } }).sort({ createdAt: -1 });
        return res.json({ success: true, data: listings });
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
            status: { $in: ['Active', 'Rented'] }
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
        const listing = await Listing.findOneAndUpdate(
            { listingId: parseInt(listingId) },
            {
                listingId: parseInt(listingId),
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
        
        console.log(`[ListingController] Saved listing ${listingId}`);
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
        
        console.log(`[ListingController] Updated listing ${listingId} status to ${status}`);
        return res.json({ success: true, data: listing });
    } catch (error) {
        console.error('[ListingController] Error updating listing status:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
