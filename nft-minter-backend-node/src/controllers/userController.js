import User from '../models/user.js';
import UserProfile from '../models/userProfile.js';
import Transaction from '../models/transaction.js';
import NFT from '../models/nft.js';
import Favorite from '../models/favorite.js';
import { validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Register a new user
export const registerUser = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { walletAddress, username, email } = req.body;
        const newUser = new User({ walletAddress, username, email });
        await newUser.save();

        return res.status(201).json({ success: true, user: newUser });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Update user profile
export const updateProfile = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const data = req.body;
        
        // Get or create user profile
        let profile = await UserProfile.findOneAndUpdate(
            { wallet_address: walletAddress },
            { $setOnInsert: { username: `User${walletAddress.slice(-4)}` } },
            { new: true, upsert: true }
        );
        
        // Handle profile image
        if (data.profile_image) {
            const imageData = data.profile_image;
            if (imageData.startsWith('data:image')) {
                const [format, imgstr] = imageData.split(';base64,');
                const ext = format.split('/')[1];
                const filename = `profile_${walletAddress}.${ext}`;
                const fileBuffer = Buffer.from(imgstr, 'base64');
                
                // For now, we'll store the base64 directly or implement file storage
                // In production, you'd want to save to a file system or cloud storage
                profile.avatar_url = imageData; // Store base64 for now
            }
        }
        
        // Handle cover image
        if (data.cover_image) {
            const imageData = data.cover_image;
            if (imageData.startsWith('data:image')) {
                const [format, imgstr] = imageData.split(';base64,');
                const ext = format.split('/')[1];
                const filename = `cover_${walletAddress}.${ext}`;
                const fileBuffer = Buffer.from(imgstr, 'base64');
                
                // For now, we'll store the base64 directly or implement file storage
                profile.banner_url = imageData; // Store base64 for now
            }
        }
        
        // Update other profile fields
        const fieldsToUpdate = ['username', 'bio', 'website', 'twitter', 'instagram', 'discord'];
        fieldsToUpdate.forEach(field => {
            if (data[field] !== undefined) {
                profile[field] = data[field];
            }
        });
        
        profile.updated_at = new Date();
        await profile.save();
        
        return res.json({
            success: true,
            data: {
                id: profile._id,
                wallet_address: profile.wallet_address,
                username: profile.username,
                avatar_url: profile.avatar_url,
                banner_url: profile.banner_url,
                bio: profile.bio,
                website: profile.website,
                twitter: profile.twitter,
                instagram: profile.instagram,
                discord: profile.discord,
                total_created: profile.total_created,
                total_collected: profile.total_collected,
                total_volume: profile.total_volume,
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Get user profile by wallet address
export const getUserProfile = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        console.log(`[DEBUG] getUserProfile called with walletAddress: ${walletAddress}`);
        
        // Create a safe username using hash of wallet address
        const crypto = await import('crypto');
        const usernameHash = crypto.createHash('md5').update(walletAddress).digest('hex').substring(0, 12);
        const username = `user_${usernameHash}`;
        
        try {
            // Try to get existing user first
            let user = await User.findOne({ walletAddress });
            let userCreated = false;
            
            if (!user) {
                // Create new user if doesn't exist
                try {
                    user = new User({
                        walletAddress,
                        username,
                        email: `${username}@example.com`
                    });
                    await user.save();
                    userCreated = true;
                    console.log(`[DEBUG] User created: ${userCreated}`);
                } catch (userError) {
                    console.error(`[ERROR] Failed to create user: ${userError}`);
                    // If user creation fails, try to get or create profile without user
                    try {
                        let profile = await UserProfile.findOne({ wallet_address: walletAddress });
                        if (!profile) {
                            profile = new UserProfile({
                                wallet_address: walletAddress,
                                username: `User${walletAddress.slice(-4)}`
                            });
                            await profile.save();
                        }
                        
                        // Get user's NFTs
                        const userNfts = await NFT.find({ owner_address: walletAddress });
                        const createdNfts = await NFT.find({ creator_address: walletAddress });
                        
                        const profileData = {
                            id: profile._id,
                            wallet_address: profile.wallet_address,
                            username: profile.username || `User${walletAddress.slice(-4)}`,
                            avatar_url: profile.avatar_url,
                            banner_url: profile.banner_url,
                            bio: profile.bio,
                            website: profile.website,
                            twitter: profile.twitter,
                            instagram: profile.instagram,
                            discord: profile.discord,
                            total_created: profile.total_created || 0,
                            total_collected: profile.total_collected || 0,
                            total_volume: profile.total_volume || 0,
                            created_at: profile.created_at,
                            nfts_owned: userNfts.length,
                            nfts_created: createdNfts.length,
                        };
                        
                        return res.json({
                            success: true,
                            data: profileData
                        });
                    } catch (profileError) {
                        console.error(`[ERROR] Profile creation failed: ${profileError}`);
                        // Return fallback response
                        return res.json({
                            success: true,
                            data: {
                                id: 0,
                                wallet_address: walletAddress,
                                username: `User${walletAddress.slice(-4)}`,
                                avatar_url: null,
                                banner_url: null,
                                bio: null,
                                website: null,
                                twitter: null,
                                instagram: null,
                                discord: null,
                                total_created: 0,
                                total_collected: 0,
                                total_volume: 0,
                                created_at: new Date(),
                                nfts_owned: 0,
                                nfts_created: 0,
                            }
                        });
                    }
                }
            }
        } catch (err) {
            console.error(`[ERROR] getUserProfile failed: ${err}`);
            // Return fallback response instead of 500 error
            return res.json({
                success: true,
                data: {
                    id: 0,
                    wallet_address: walletAddress,
                    username: `User${walletAddress.slice(-4)}`,
                    avatar_url: null,
                    banner_url: null,
                    bio: null,
                    website: null,
                    twitter: null,
                    instagram: null,
                    discord: null,
                    total_created: 0,
                    total_collected: 0,
                    total_volume: 0,
                    created_at: new Date(),
                    nfts_owned: 0,
                    nfts_created: 0,
                }
            });
        }
        
        // Get or create profile
        try {
            let profile = await UserProfile.findOneAndUpdate(
                { wallet_address: walletAddress },
                {
                    $setOnInsert: {
                        username: `User${walletAddress.slice(-4)}`
                    }
                },
                { new: true, upsert: true }
            );
            console.log(`[DEBUG] Profile found/created: ${profile._id}`);
        } catch (profileError) {
            console.error(`[ERROR] Profile creation failed: ${profileError}`);
            // Return basic profile response
            return res.json({
                success: true,
                data: {
                    id: 0,
                    wallet_address: walletAddress,
                    username: `User${walletAddress.slice(-4)}`,
                    avatar_url: null,
                    banner_url: null,
                    bio: null,
                    website: null,
                    twitter: null,
                    instagram: null,
                    discord: null,
                    total_created: 0,
                    total_collected: 0,
                    total_volume: 0,
                    created_at: new Date(),
                    nfts_owned: 0,
                    nfts_created: 0,
                }
            });
        }
        
        // Get user's NFTs
        const userNfts = await NFT.find({ owner_address: walletAddress });
        const createdNfts = await NFT.find({ creator_address: walletAddress });
        // console.log(`[DEBUG] NFTs found: ${userNfts.length} owned, ${createdNfts.length} created`);
        
        const profile = await UserProfile.findOne({ wallet_address: walletAddress });
        
        const profileData = {
            id: profile._id,
            wallet_address: profile.wallet_address,
            username: profile.username || `User${walletAddress.slice(-4)}`,
            avatar_url: profile.avatar_url,
            banner_url: profile.banner_url,
            bio: profile.bio,
            website: profile.website,
            twitter: profile.twitter,
            instagram: profile.instagram,
            discord: profile.discord,
            total_created: profile.total_created || 0,
            total_collected: profile.total_collected || 0,
            total_volume: profile.total_volume || 0,
            created_at: profile.created_at,
            nfts_owned: userNfts.length,
            nfts_created: createdNfts.length,
        };
         
        return res.json({
            success: true,
            data: profileData
        });
    } catch (error) {
        console.error(`[ERROR] getUserProfile failed: ${error}`);
        // Return fallback response instead of 500 error
        return res.json({
            success: true,
            data: {
                id: 0,
                wallet_address: req.params.walletAddress,
                username: `User${req.params.walletAddress.slice(-4)}`,
                avatar_url: null,
                banner_url: null,
                bio: null,
                website: null,
                twitter: null,
                instagram: null,
                discord: null,
                total_created: 0,
                total_collected: 0,
                total_volume: 0,
                created_at: new Date(),
                nfts_owned: 0,
                nfts_created: 0,
            }
        });
    }
};

// Follow a user
export const followUser = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { follower_address } = req.body;
        if (!follower_address) {
            return res.status(400).json({ success: false, error: 'Missing follower_address' });
        }
        // Get or create user profiles
        let user = await UserProfile.findOneAndUpdate(
            { wallet_address: walletAddress },
            { $setOnInsert: { username: `User${walletAddress.slice(-4)}` } },
            { new: true, upsert: true }
        );
        let follower = await UserProfile.findOneAndUpdate(
            { wallet_address: follower_address },
            { $setOnInsert: { username: `User${follower_address.slice(-4)}` } },
            { new: true, upsert: true }
        );
        // Check if already following
        if (user.followers && user.followers.includes(follower._id)) {
            return res.status(400).json({ success: false, error: 'Already following this user' });
        }
        // Add follower
        user.followers = user.followers || [];
        user.followers.push(follower._id);
        await user.save();
        // Add to follower's following
        follower.following = follower.following || [];
        follower.following.push(user._id);
        await follower.save();
        // Create activity for the user being followed
        try {
            await Transaction.create({
                transaction_hash: `follow_${follower_address}_${walletAddress}_${Date.now()}`,
                nft: null,
                from_address: follower_address,
                to_address: walletAddress,
                transaction_type: 'follow',
                price: null,
                block_number: 0,
                gas_used: 0,
                gas_price: 0,
                timestamp: new Date()
            });
        } catch (activity_error) {
            // Log warning, do not fail
            console.warn('[WARNING] Failed to create follow activity:', activity_error);
        }
        return res.json({
            success: true,
            followers_count: user.followers.length,
            following_count: follower.following.length
        });
    } catch (error) {
        console.error('[ERROR] followUser:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get NFTs created by user
export const getUserCreatedNFTs = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const nfts = await NFT.find({ creator_address: walletAddress }).lean();
        console.log(`[DEBUG] getUserCreatedNFTs found ${nfts.length} NFTs for user ${walletAddress}`);
        const nfts_data = nfts.map(nft => ({
            id: `local_${nft._id}`,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_auction: nft.is_auction,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.collection,
            category: nft.category,
            created_at: nft.created_at,
        }));
        res.json({ success: true, data: nfts_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get all NFTs owned or created by user
export const getUserNfts = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const owned_nfts = await NFT.find({ owner_address: walletAddress }).lean();
        
        const created_nfts = await NFT.find({ creator_address: walletAddress }).lean();
        const nftMap = new Map();
        for (const nft of owned_nfts) {
            nftMap.set(nft.token_id, nft);
        }
        for (const nft of created_nfts) {
            nftMap.set(nft.token_id, nft);
        }
        const nfts = Array.from(nftMap.values());
        const nfts_data = nfts.map(nft => ({
            id: `local_${nft._id}`,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_auction: nft.is_auction,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.collection,
            category: nft.category,
            created_at: nft.created_at,
        }));
        res.json({ success: true, data: nfts_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
export const unfollowUser = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { follower_address } = req.body;
        if (!follower_address) {
            return res.status(400).json({ success: false, error: 'Missing follower_address' });
        }
        // Get user profiles
        const user = await UserProfile.findOne({ wallet_address: walletAddress });
        const follower = await UserProfile.findOne({ wallet_address: follower_address });
        if (!user || !follower) {
            return res.status(404).json({ success: false, error: 'User or follower not found' });
        }
        // Check if not following
        if (!user.followers || !user.followers.includes(follower._id)) {
            return res.status(400).json({ success: false, error: 'Not following this user' });
        }
        // Remove follower
        user.followers = user.followers.filter(id => !id.equals(follower._id));
        await user.save();
        // Remove from follower's following
        follower.following = follower.following.filter(id => !id.equals(user._id));
        await follower.save();
        // Create activity for the user being unfollowed
        try {
            await Transaction.create({
                transaction_hash: `unfollow_${follower_address}_${walletAddress}_${Date.now()}`,
                nft: null,
                from_address: follower_address,
                to_address: walletAddress,
                transaction_type: 'unfollow',
                price: null,
                block_number: 0,
                gas_used: 0,
                gas_price: 0,
                timestamp: new Date()
            });
        } catch (activity_error) {
            console.warn('[WARNING] Failed to create unfollow activity:', activity_error);
        }
        return res.json({
            success: true,
            followers_count: user.followers.length,
            following_count: follower.following.length
        });
    } catch (error) {
        console.error('[ERROR] unfollowUser:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get followers
export const getFollowers = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const user = await UserProfile.findOne({ wallet_address: walletAddress }).populate('followers');
        if (!user) {
            return res.json({ success: true, followers: [], count: 0 });
        }
        const followers = user.followers.map(follower => ({
            wallet_address: follower.wallet_address,
            username: follower.username,
            avatar_url: follower.avatar_url
        }));
        return res.json({ success: true, followers, count: followers.length });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Get following
export const getFollowing = async (req, res) => {
    console.log('[DEBUG] getFollowing called');
    try {
        const { walletAddress } = req.params;
        const user = await UserProfile.findOne({ wallet_address: walletAddress }).populate('following');
        if (!user) {
            return res.json({ success: true, following: [], count: 0 });
        }
        const following = user.following.map(followedUser => ({
            wallet_address: followedUser.wallet_address,
            username: followedUser.username,
            avatar_url: followedUser.avatar_url
        }));
        return res.json({ success: true, following, count: following.length });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Get user liked NFTs
// export const getUserLikedNfts = async (req, res) => {
//     try {
//         const { walletAddress } = req.params;
//         console.log(`[DEBUG] getUserLikedNfts called for user: ${walletAddress}`);
        
//         // Get local NFT favorites
//         const favorites = await Favorite.find({ user_address: walletAddress }).populate('nft');
//         console.log(`[DEBUG] Found ${favorites.length} local favorites for user`);
        
//         const likedNfts = [];
        
//         // Process local NFT favorites
//         for (const favorite of favorites) {
//             if (favorite.nft) {
//                 const nft = favorite.nft;
//                 const nftData = {
//                     id: `local_${nft._id}`,
//                     token_id: nft.token_id,
//                     name: nft.name,
//                     description: nft.description,
//                     image_url: nft.image_url,
//                     price: nft.price != null ? parseFloat(nft.price) : null,
//                     is_listed: nft.is_listed,
//                     is_auction: nft.is_auction,
//                     owner_address: nft.owner_address,
//                     creator_address: nft.creator_address,
//                     collection: nft.collection,
//                     category: nft.category,
//                     created_at: nft.created_at,
//                     source: 'local',
//                     liked: true,
//                     favorited_at: favorite.created_at
//                 };
//                 likedNfts.push(nftData);
//             }
//         }
        
//         console.log(`[DEBUG] Returning ${likedNfts.length} total liked NFTs`);
//         return res.json({
//             success: true,
//             data: likedNfts,
//             count: likedNfts.length
//         });
//     } catch (error) {
//         console.error(`[ERROR] getUserLikedNfts: ${error}`);
//         return res.status(500).json({ success: false, error: error.message });
//     }
// };

export const getUserLikedNfts = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        console.log(`[DEBUG] getUserLikedNfts called for user: ${walletAddress}`);
        
        // Validate wallet address
        if (!walletAddress || walletAddress.trim() === '') {
            console.log('[ERROR] Invalid wallet address provided');
            return res.status(400).json({ 
                success: false, 
                error: 'Valid wallet address is required' 
            });
        }

        // Get local NFT favorites with selective population
        // Using .lean() to avoid circular references and selecting only needed fields
        const favorites = await Favorite.find({ user_address: walletAddress })
            .populate({
                path: 'nft',
                select: 'token_id name description image_url price is_listed is_auction owner_address creator_address collection category created_at', // Only select needed fields
                options: { lean: true } // Convert to plain objects
            })
            .lean(); // Convert the entire query result to plain objects
        
        console.log(`[DEBUG] Found ${favorites.length} local favorites for user`);
        
        // Handle case where no favorites exist
        if (!favorites || favorites.length === 0) {
            console.log('[DEBUG] No favorites found for user');
            return res.json({
                success: true,
                data: [],
                count: 0,
                message: 'No liked NFTs found'
            });
        }

        const likedNfts = [];
        
        // Process local NFT favorites with error handling for each item
        for (const favorite of favorites) {
            try {
                // Skip if the favorite doesn't have an associated NFT
                if (!favorite.nft) {
                    console.log(`[WARNING] Favorite ${favorite._id} has no associated NFT, skipping`);
                    continue;
                }

                const nft = favorite.nft;
                
                // Create clean NFT data object
                const nftData = {
                    id: `local_${nft._id}`,
                    token_id: nft.token_id || null,
                    name: nft.name || 'Unnamed NFT',
                    description: nft.description || '',
                    image_url: nft.image_url || '',
                    price: nft.price != null ? parseFloat(nft.price) : null,
                    is_listed: Boolean(nft.is_listed),
                    is_auction: Boolean(nft.is_auction),
                    owner_address: nft.owner_address || '',
                    creator_address: nft.creator_address || '',
                    collection: nft.collection || 'Unknown',
                    category: nft.category || 'other',
                    created_at: nft.created_at || null,
                    source: 'local',
                    liked: true,
                    favorited_at: favorite.created_at || null
                };

                likedNfts.push(nftData);
            } catch (itemError) {
                console.error(`[ERROR] Failed to process favorite ${favorite._id}:`, itemError.message);
                // Continue processing other items instead of failing the entire request
                continue;
            }
        }
        
        console.log(`[DEBUG] Successfully processed ${likedNfts.length} out of ${favorites.length} favorites`);
        
        // Return successful response
        return res.json({
            success: true,
            data: likedNfts,
            count: likedNfts.length,
            total_favorites: favorites.length
        });

    } catch (error) {
        // Enhanced error logging
        console.error(`[ERROR] getUserLikedNfts failed for user ${req.params?.walletAddress}:`);
        console.error(`[ERROR] Error type: ${error.name}`);
        console.error(`[ERROR] Error message: ${error.message}`);
        console.error(`[ERROR] Stack trace:`, error.stack);

        // Handle specific error types
        let errorMessage = 'Failed to fetch liked NFTs';
        let statusCode = 500;

        if (error.name === 'ValidationError') {
            errorMessage = 'Invalid request parameters';
            statusCode = 400;
        } else if (error.name === 'CastError') {
            errorMessage = 'Invalid wallet address format';
            statusCode = 400;
        } else if (error.name === 'MongoError' || error.name === 'MongooseError') {
            errorMessage = 'Database connection error';
            statusCode = 503;
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Request timeout - please try again';
            statusCode = 408;
        }

        return res.status(statusCode).json({ 
            success: false, 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? {
                originalError: error.message,
                errorType: error.name
            } : undefined
        });
    }
};

// Alternative version using aggregation (more efficient for large datasets)
export const getUserLikedNftsAggregation = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        console.log(`[DEBUG] getUserLikedNftsAggregation called for user: ${walletAddress}`);

        if (!walletAddress || walletAddress.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid wallet address is required' 
            });
        }

        // Use aggregation to avoid circular reference issues
        const likedNfts = await Favorite.aggregate([
            { $match: { user_address: walletAddress } },
            {
                $lookup: {
                    from: 'nfts', // Collection name (make sure this matches your NFT collection name)
                    localField: 'nft',
                    foreignField: '_id',
                    as: 'nft_data'
                }
            },
            { $unwind: '$nft_data' },
            {
                $project: {
                    _id: 1,
                    created_at: 1,
                    'nft_data._id': 1,
                    'nft_data.token_id': 1,
                    'nft_data.name': 1,
                    'nft_data.description': 1,
                    'nft_data.image_url': 1,
                    'nft_data.price': 1,
                    'nft_data.is_listed': 1,
                    'nft_data.is_auction': 1,
                    'nft_data.owner_address': 1,
                    'nft_data.creator_address': 1,
                    'nft_data.collection': 1,
                    'nft_data.category': 1,
                    'nft_data.created_at': 1
                }
            }
        ]);

        const processedNfts = likedNfts.map(item => ({
            id: `local_${item.nft_data._id}`,
            token_id: item.nft_data.token_id || null,
            name: item.nft_data.name || 'Unnamed NFT',
            description: item.nft_data.description || '',
            image_url: item.nft_data.image_url || '',
            price: item.nft_data.price != null ? parseFloat(item.nft_data.price) : null,
            is_listed: Boolean(item.nft_data.is_listed),
            is_auction: Boolean(item.nft_data.is_auction),
            owner_address: item.nft_data.owner_address || '',
            creator_address: item.nft_data.creator_address || '',
            collection: item.nft_data.collection || 'Unknown',
            category: item.nft_data.category || 'other',
            created_at: item.nft_data.created_at || null,
            source: 'local',
            liked: true,
            favorited_at: item.created_at || null
        }));

        console.log(`[DEBUG] Aggregation returned ${processedNfts.length} liked NFTs`);

        return res.json({
            success: true,
            data: processedNfts,
            count: processedNfts.length
        });

    } catch (error) {
        console.error(`[ERROR] getUserLikedNftsAggregation:`, error.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch liked NFTs',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
export { getUserNfts as getUserNFTs };
