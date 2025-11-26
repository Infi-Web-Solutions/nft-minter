import express from 'express';
import {
    getUserProfile,
    updateProfile,
    getUserNFTs,
    getUserCreatedNFTs,
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    getUserLikedNfts
} from '../controllers/userController.js';

const router = express.Router();

router.get('/:walletAddress', getUserProfile);
router.post('/:walletAddress/update', updateProfile);
router.get('/:walletAddress/nfts', getUserNFTs);
router.get('/:walletAddress/created-nfts', getUserCreatedNFTs);
router.get('/:walletAddress/liked-nfts', getUserLikedNfts);
router.get('/:walletAddress/followers', getFollowers);
router.get('/:walletAddress/following', getFollowing);
router.post('/:walletAddress/follow', followUser);
router.post('/:walletAddress/unfollow', unfollowUser);

export default router;
