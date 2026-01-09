import express from 'express';
import {
    getAllTransactions,
    getTransactionsByNFT,
    getTransactionsByUser,
    getTransactionsByListing,
    getTransactionStats,
    createTransaction
} from '../controllers/rentalTransactionController.js';

const router = express.Router();

// Create a new transaction
router.post('/', createTransaction);

// Get all transactions (with pagination)
router.get('/', getAllTransactions);

// Get transaction statistics
router.get('/stats', getTransactionStats);

// Get transactions by NFT
router.get('/nft/:nftAddress/:tokenId', getTransactionsByNFT);

// Get transactions by user address
router.get('/user/:userAddress', getTransactionsByUser);

// Get transactions by listing ID
router.get('/listing/:listingId', getTransactionsByListing);

export default router;
