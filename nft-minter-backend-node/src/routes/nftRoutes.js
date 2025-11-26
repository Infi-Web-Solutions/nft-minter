import express from 'express';
import {
    registerNft,
    updateNftOwner,
    buyNft,
    getNftDetail,
    getNfts,
    searchNfts,
    getUserNfts,
    getUserCreatedNfts,
    toggleNftLike,
    setNftListed,
    getCombinedNfts,
    getCollectionsByLikes,
    getTrendingCollections,
    getContractInfo,
    getNftByCombinedId,
    getNftStats,
    trackNftView,
    getCollections
} from '../controllers/nftController.js';

const router = express.Router();

// Basic NFT operations
router.post('/register/', registerNft);
router.get('/search/', searchNfts);
router.get('/', getNfts);

// Collections
router.get('/collections/', getCollections);
router.get('/collections/trending/', getTrendingCollections);
router.get('/collections/by-likes/', getCollectionsByLikes);

// Combined endpoints (must come before dynamic routes)
router.get('/combined/', getCombinedNfts);
router.get('/combined/:combined_id/', getNftByCombinedId);

// Blockchain
router.get('/contract/info/', getContractInfo);

// Dynamic routes (must come last to avoid conflicts)
router.post('/:token_id/buy/', buyNft);
router.post('/:token_id/transfer/', updateNftOwner);
router.get('/:token_id/', getNftDetail);
router.get('/:nft_id/stats/', getNftStats);
router.post('/:nft_id/track-view/', trackNftView);
router.post('/:nft_id/toggle-like/', toggleNftLike);
router.post('/:token_id/set_listed/', setNftListed);

export default router;
