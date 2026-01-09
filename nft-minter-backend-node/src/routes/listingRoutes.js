import express from 'express';
import {
    getActiveListings,
    getListingByNFT,
    syncListingsFromBlockchain,
    saveListing,
    updateListingStatus
} from '../controllers/listingController.js';

const router = express.Router();

// Get all active listings
router.get('/active', getActiveListings);

// Get listing by NFT address and token ID
router.get('/nft/:nftAddress/:tokenId', getListingByNFT);

// Sync listings from blockchain (admin)
router.post('/sync', syncListingsFromBlockchain);

// Save a new listing
router.post('/', saveListing);

// Update listing status
router.put('/:listingId/status', updateListingStatus);

export default router;
