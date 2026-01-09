import express from 'express';
import {
    getUserProfile,
    updateProfile,
    getUserNfts,
    getUserCreatedNFTs,
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    getUserLikedNfts,
    getUserListings,
    getUserRentedOut,
    getUserRentals
} from '../controllers/userController.js';

const router = express.Router();

// Profile endpoints matching Django URL patterns
router.get('/:walletAddress/', getUserProfile);
router.post('/:walletAddress/update/', updateProfile);
router.get('/:walletAddress/nfts/', getUserNfts);
router.get('/:walletAddress/created/', getUserCreatedNFTs);
router.get('/:walletAddress/liked/', getUserLikedNfts);
router.post('/:walletAddress/follow/', followUser);
router.post('/:walletAddress/unfollow/', unfollowUser);
router.get('/:walletAddress/followers/', getFollowers);
router.get('/:walletAddress/following/', getFollowing);
router.get('/:walletAddress/listings/', getUserListings);
router.get('/:walletAddress/rented-out/', getUserRentedOut);
router.get('/:walletAddress/rentals/', getUserRentals);

export default router;
