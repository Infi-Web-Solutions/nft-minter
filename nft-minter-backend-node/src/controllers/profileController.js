import UserProfile from '../models/userProfile.js';
import User from '../models/user.js';
import NFT from '../models/nft.js';
import Favorite from '../models/favorite.js';
import Transaction from '../models/transaction.js';

// Get user profile by address
export const getProfileByAddress = async (req, res) => {
    try {
        const { address } = req.params;
        
        let profile = await UserProfile.findOne({ wallet_address: address.toLowerCase() });
        
        // if (!profile) {
        //     // Create a basic profile if it doesn't exist
        //     profile = new UserProfile({
        //         wallet_address: address.toLowerCase(),
        //         username: `User_${address.slice(0, 6)}`,
        //         avatar_url: '',
        //         banner_url: '',
        //         total_created: 0,
        //         total_collected: 0,
        //         total_volume: 0,
        //         nfts_owned: 0,
        //         nfts_created: 0
        //     });
        //     await profile.save();
        // }
        
        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        console.error('[ERROR] getProfileByAddress:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update user profile
export const updateProfile = async (req, res) => {
    try {
        const { address } = req.params;
        const updates = req.body;
        
        let profile = await UserProfile.findOne({ wallet_address: address.toLowerCase() });
        
        // if (!profile) {
        //     // Create new profile
        //     profile = new UserProfile({
        //         wallet_address: address.toLowerCase(),
        //         username: updates.username || `User_${address.slice(0, 6)}`,
        //         avatar_url: updates.avatar_url || '',
        //         banner_url: updates.banner_url || '',
        //         bio: updates.bio || null,
        //         website: updates.website || null,
        //         twitter: updates.twitter || null,
        //         instagram: updates.instagram || null,
        //         discord: updates.discord || null,
        //         total_created: 0,
        //         total_collected: 0,
        //         total_volume: 0,
        //         nfts_owned: 0,
        //         nfts_created: 0
        //     });
        // } else {
        //     // Update existing profile
        //     Object.assign(profile, updates);
        // }
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Profile not found. Please create a profile first.' });
        }
        
        // Update existing profile
        Object.assign(profile, updates);     
        await profile.save();
        res.status(200).json({ success: true, data: profile });
    } catch (error) {
        console.error('[ERROR] updateProfile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get user's created NFTs
export const getUserCreatedNFTs = async (req, res) => {
    try {
        const { address } = req.params;
        
        const nfts = await NFT.find({ creator_address: address.toLowerCase() });
        
        res.status(200).json({ success: true, data: nfts });
    } catch (error) {
        console.error('[ERROR] getUserCreatedNFTs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get user's owned NFTs
export const getUserOwnedNFTs = async (req, res) => {
    try {
        const { address } = req.params;
        
        const nfts = await NFT.find({ owner_address: address.toLowerCase() });
        
        res.status(200).json({ success: true, data: nfts });
    } catch (error) {
        console.error('[ERROR] getUserOwnedNFTs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get user's liked NFTs
export const getUserLikedNFTs = async (req, res) => {
    try {
        const { address } = req.params;
        
        const favorites = await Favorite.find({ user_address: address.toLowerCase() }).populate('nft_id');
        const nfts = favorites.map(fav => fav.nft_id).filter(nft => nft);
        
        res.status(200).json({ success: true, data: nfts });
    } catch (error) {
        console.error('[ERROR] getUserLikedNFTs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get user's followers
export const getUserFollowers = async (req, res) => {
    try {
        const { address } = req.params;
        
        // For now, return empty array as following system needs to be implemented
        res.status(200).json({ success: true, data: [] });
    } catch (error) {
        console.error('[ERROR] getUserFollowers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get user's following
export const getUserFollowing = async (req, res) => {
    try {
        const { address } = req.params;
        
        // For now, return empty array as following system needs to be implemented
        res.status(200).json({ success: true, data: [] });
    } catch (error) {
        console.error('[ERROR] getUserFollowing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
