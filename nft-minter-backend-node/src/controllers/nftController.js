import mongoose from 'mongoose';
import axios from 'axios';
import NFT from '../models/nft.js';
import Transaction from '../models/transaction.js';
import web3Utils from '../utils/web3Utils.js';
import UserProfile from '../models/userProfile.js';
import Favorite from '../models/favorite.js';
import Collection from '../models/collection.js';
import NFTView from '../models/nftView.js';
import { uploadToIPFS } from '../utils/ipfsUtils.js';
import { createRequire } from 'module';
import hammingDistance from 'hamming-distance';

// Import CommonJS module in ES module
const require = createRequire(import.meta.url);
const { imageHash } = require('image-hash');

// Calculate perceptual hash from file buffer
const calculatePerceptualHash = async (fileBuffer) => {
    try {
        console.log('[DEBUG] Calculating perceptual hash...');
        console.log('[DEBUG] File buffer length:', fileBuffer.length);

        // Wrap imageHash callback in a Promise
        const hash = await new Promise((resolve, reject) => {
            imageHash({
                data: fileBuffer,
                type: 'buffer'
            }, 16, 'hex', (error, data) => {
                if (error) {
                    console.error('[DEBUG] imageHash error:', error);
                    reject(error);
                } else {
                    console.log('[DEBUG] imageHash success:', data);
                    resolve(data);
                }
            });
        });

        console.log('[DEBUG] Perceptual hash calculated:', hash);
        return hash;
    } catch (error) {
        console.error('[ERROR] Failed to calculate perceptual hash:', error);
        throw new Error('Failed to calculate image hash: ' + error.message);
    }
};

// Calculate perceptual hash from uploaded file (API endpoint)
export const calculateHashFromFile = async (req, res) => {
    try {
        console.log('[DEBUG] calculateHashFromFile called');

        if (!req.files || !req.files.file) {
            console.log('[DEBUG] No file in request');
            return res.status(400).json({
                success: false,
                error: 'No file provided'
            });
        }

        const fileBuffer = req.files.file.data;
        console.log('[DEBUG] File size:', fileBuffer.length);

        const pHash = await calculatePerceptualHash(fileBuffer);

        return res.json({
            success: true,
            perceptual_hash: pHash
        });
    } catch (error) {
        console.error('[ERROR] calculateHashFromFile:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Check for duplicate NFT by perceptual hash (using hamming distance)
export const checkDuplicateNft = async (req, res) => {
    try {
        const { perceptual_hash } = req.body;
        console.log('[DEBUG] checkDuplicateNft called with perceptual_hash:', perceptual_hash);

        if (!perceptual_hash) {
            console.log('[DEBUG] No perceptual_hash provided');
            return res.status(400).json({
                success: false,
                error: 'perceptual_hash is required'
            });
        }

        // Get all NFTs that have perceptual hashes
        const allNfts = await NFT.find({ perceptual_hash: { $ne: null, $exists: true } });
        console.log('[DEBUG] Found', allNfts.length, 'NFTs with perceptual hashes');

        // Check hamming distance against each NFT
        const SIMILARITY_THRESHOLD = 10; // Distance < 10 means similar images

        for (const nft of allNfts) {
            const distance = hammingDistance(perceptual_hash, nft.perceptual_hash);
            console.log(`[DEBUG] Comparing with NFT ${nft.token_id}: distance = ${distance}`);

            if (distance < SIMILARITY_THRESHOLD) {
                console.log('[DEBUG] Similar image detected! NFT:', {
                    token_id: nft.token_id,
                    name: nft.name,
                    similarity_distance: distance
                });
                return res.json({
                    success: true,
                    exists: true,
                    similarity: distance,
                    nft: {
                        token_id: nft.token_id,
                        name: nft.name,
                        image_url: nft.image_url
                    }
                });
            }
        }

        console.log('[DEBUG] No similar images found');
        return res.json({
            success: true,
            exists: false,
            nft: null
        });
    } catch (error) {
        console.error("[ERROR] check_duplicate_nft:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const registerNft = async (req, res) => {
    try {
        const data = req.body;
        console.log("[DEBUG] registerNft called with data:", {
            token_id: data.token_id,
            name: data.name,
            contract_address: data.contract_address,
            has_perceptual_hash: !!data.perceptual_hash,
            perceptual_hash: data.perceptual_hash ? data.perceptual_hash.substring(0, 16) + '...' : 'none'
        });

        const nft = await NFT.findOneAndUpdate(
            { token_id: data.token_id },
            {
                name: data.name,
                description: data.description,
                image_url: data.image_url,
                token_uri: data.token_uri || '',
                creator_address: data.creator_address,
                owner_address: data.owner_address,
                contract_address: data.contract_address || process.env.NFT_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS,
                price: data.price,
                is_listed: data.is_listed || false,
                is_auction: data.is_auction || false,
                nft_collection: data.collection,
                category: data.category,
                perceptual_hash: data.perceptual_hash || null, // Store perceptual hash for similarity detection
            },
            { new: true, upsert: true }
        );

        console.log("[DEBUG] NFT registered successfully with ID:", nft._id);

        // Update user profile stats
        if (data.creator_address) {
            await UserProfile.findOneAndUpdate(
                { wallet_address: data.creator_address },
                { $inc: { total_created: 1 } },
                { upsert: true }
            );
        }

        return res.json({ success: true, created: !nft.isNew, nft_id: nft._id });
    } catch (error) {
        console.error("[ERROR] register_nft:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const buyNft = async (req, res) => {
    try {
        const { token_id } = req.params;
        const { buyer_address } = req.body;

        if (!buyer_address) {
            return res.status(400).json({ success: false, error: 'Buyer address required' });
        }

        const nft = await NFT.findOne({ token_id });
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        if (!nft.is_listed || !nft.price) {
            return res.status(400).json({ success: false, error: 'NFT is not listed for sale' });
        }

        if (nft.owner_address.toLowerCase() === buyer_address.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Cannot buy your own NFT' });
        }

        // Check buyer's balance
        const balance = await web3Utils.getBalance(buyer_address);
        const priceInWei = web3Utils.web3.utils.toWei(nft.price.toString(), 'ether');

        if (web3Utils.web3.utils.toBN(balance).lt(web3Utils.web3.utils.toBN(priceInWei))) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }

        // Execute the buy transaction
        const tx = await web3Utils.buyNFT(token_id, buyer_address);
        const receipt = await web3Utils.waitForTransaction(tx);

        // Update NFT owner in database
        const oldOwner = nft.owner_address;
        nft.owner_address = buyer_address;
        nft.is_listed = false;
        await nft.save();

        // Update user profile stats for buyer
        await UserProfile.findOneAndUpdate(
            { wallet_address: buyer_address },
            { $inc: { total_collected: 1 } },
            { upsert: true }
        );

        // Update user profile stats for seller (optional: update volume)
        if (oldOwner) {
            await UserProfile.findOneAndUpdate(
                { wallet_address: oldOwner },
                { $inc: { total_volume: nft.price } },
                { upsert: true }
            );
        }

        // Create transaction record
        const transactionData = {
            transaction_hash: receipt.transactionHash,
            nft: nft._id,
            from_address: oldOwner,
            to_address: buyer_address,
            transaction_type: 'buy',
            price: nft.price,
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed,
            gas_price: receipt.effectiveGasPrice || 0,
            timestamp: new Date(),
        };

        await Transaction.create(transactionData);

        return res.json({
            success: true,
            transaction_hash: receipt.transactionHash,
            new_owner: buyer_address
        });
    } catch (error) {
        console.error('[ERROR] buyNft:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const updateNftOwner = async (req, res) => {
    try {
        const { token_id } = req.params;
        const data = req.body;
        const transaction_hash = data.transaction_hash;

        if (!transaction_hash) {
            return res.status(400).json({ success: false, error: 'Transaction hash required' });
        }

        // Verify the transaction on-chain
        const receipt = await web3Utils.web3.eth.getTransactionReceipt(transaction_hash);
        if (!receipt) {
            return res.status(400).json({ success: false, error: 'Transaction not found on blockchain' });
        }

        if (!receipt.status) {
            return res.status(400).json({ success: false, error: 'Transaction failed on blockchain' });
        }

        // Get transaction details
        const tx = await web3Utils.web3.eth.getTransaction(transaction_hash);
        if (tx.to.toLowerCase() !== web3Utils.contractAddress.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Transaction not sent to NFT contract' });
        }

        // Get the new owner from blockchain
        const newOwner = await web3Utils.getNftOwner(token_id);
        if (!newOwner) {
            return res.status(400).json({ success: false, error: 'Could not fetch new owner from blockchain' });
        }

        const nft = await NFT.findOne({ token_id });
        const oldOwner = nft.owner_address;

        if (oldOwner.toLowerCase() === newOwner.toLowerCase()) {
            return res.json({ success: true, owner_address: newOwner, message: 'Owner already updated' });
        }

        // Update NFT in database
        nft.owner_address = newOwner;
        nft.is_listed = false; // Assuming buy removes listing
        await nft.save();

        // Update user profile stats for new owner
        await UserProfile.findOneAndUpdate(
            { wallet_address: newOwner },
            { $inc: { total_collected: 1 } },
            { upsert: true }
        );

        // Create transaction record
        const transactionData = {
            transaction_hash: transaction_hash,
            nft: nft._id,
            from_address: oldOwner,
            to_address: newOwner,
            transaction_type: 'buy',
            price: data.price || 0,
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed,
            gas_price: tx.gasPrice,
            timestamp: new Date(),
        };

        await Transaction.create(transactionData);

        return res.json({ success: true, owner_address: newOwner });
    } catch (error) {
        console.error('[ERROR] updateNftOwner:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

export const getActivities = async (req, res) => {
    try {
        let { page = 1, limit = 20, type, time_filter = '24h', search = '' } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const query = {};
        if (type && type !== 'all') query.transaction_type = type;
        // Time filter
        const now = new Date();
        if (time_filter === '1h') query.timestamp = { $gte: new Date(now.getTime() - 60 * 60 * 1000) };
        else if (time_filter === '24h') query.timestamp = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
        else if (time_filter === '7d') query.timestamp = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        else if (time_filter === '30d') query.timestamp = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        // Search
        if (search) {
            query.$or = [
                { 'nft.name': { $regex: search, $options: 'i' } },
                { 'nft.nft_collection': { $regex: search, $options: 'i' } },
                { from_address: { $regex: search, $options: 'i' } },
                { to_address: { $regex: search, $options: 'i' } }
            ];
        }
        // Query with population
        const activities = await Transaction.find(query)
            .populate('nft')
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit);
        const total = await Transaction.countDocuments(query);
        // Format response
        const activities_data = await Promise.all(activities.map(async (activity) => {
            // Get usernames (mocked, as UserProfile may not exist)
            const fromProfile = await UserProfile.findOne({ wallet_address: activity.from_address });
            const toProfile = await UserProfile.findOne({ wallet_address: activity.to_address });
            const fromUsername = fromProfile?.username || `User${activity.from_address?.slice(-4)}`;
            const toUsername = toProfile?.username || `User${activity.to_address?.slice(-4)}`;
            // Time ago
            const diff = (Date.now() - new Date(activity.timestamp).getTime()) / 1000;
            let timeAgo = '';
            if (diff > 86400) timeAgo = `${Math.floor(diff / 86400)} days ago`;
            else if (diff > 3600) timeAgo = `${Math.floor(diff / 3600)} hours ago`;
            else timeAgo = `${Math.floor(diff / 60)} minutes ago`;
            if (['follow', 'unfollow'].includes(activity.transaction_type)) {
                return {
                    id: activity._id,
                    type: activity.transaction_type,
                    nft: null,
                    from: {
                        address: activity.from_address,
                        name: fromUsername,
                        avatar: `https://images.unsplash.com/photo-147209${9645785 + activity._id}?w=32&h=32&fit=crop&crop=face`
                    },
                    to: {
                        address: activity.to_address,
                        name: toUsername,
                        avatar: `https://images.unsplash.com/photo-147209${9645785 + activity._id + 100}?w=32&h=32&fit=crop&crop=face`
                    },
                    price: null,
                    timestamp: activity.timestamp,
                    time_ago: timeAgo,
                    transaction_hash: activity.transaction_hash,
                    block_number: activity.block_number,
                };
            } else {
                return {
                    id: activity._id,
                    type: activity.transaction_type,
                    nft: activity.nft ? {
                        id: activity.nft._id,
                        name: activity.nft.name,
                        image_url: activity.nft.image_url,
                        collection: activity.nft.nft_collection,
                        token_id: activity.nft.token_id
                    } : null,
                    from: {
                        address: activity.from_address,
                        name: fromUsername,
                        avatar: `https://images.unsplash.com/photo-147209${9645785 + activity._id}?w=32&h=32&fit=crop&crop=face`
                    },
                    to: {
                        address: activity.to_address,
                        name: toUsername,
                        avatar: `https://images.unsplash.com/photo-147209${9645785 + activity._id + 100}?w=32&h=32&fit=crop&crop=face`
                    },
                    price: activity.price,
                    timestamp: activity.timestamp,
                    time_ago: timeAgo,
                    transaction_hash: activity.transaction_hash,
                    block_number: activity.block_number,
                    gas_used: activity.gas_used,
                    gas_price: activity.gas_price
                };
            }
        }));
        res.json({
            success: true,
            data: activities_data,
            pagination: {
                page,
                total_pages: Math.ceil(total / limit),
                total_items: total,
                has_next: page * limit < total,
                has_previous: page > 1
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getActivityStats = async (req, res) => {
    try {
        const now = new Date();
        const last_24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last_7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last_30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const getStats = async (since) => ({
            total: await Transaction.countDocuments({ timestamp: { $gte: since } }),
            sales: await Transaction.countDocuments({ timestamp: { $gte: since }, transaction_type: 'buy' }),
            listings: await Transaction.countDocuments({ timestamp: { $gte: since }, transaction_type: 'list' }),
            mints: await Transaction.countDocuments({ timestamp: { $gte: since }, transaction_type: 'mint' }),
            transfers: await Transaction.countDocuments({ timestamp: { $gte: since }, transaction_type: 'transfer' }),
            offers: await Transaction.countDocuments({ timestamp: { $gte: since }, transaction_type: 'bid' }),
        });
        const stats = {
            last_24h: await getStats(last_24h),
            last_7d: await getStats(last_7d),
            last_30d: await getStats(last_30d),
        };
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCollectionsByLikes = async (req, res) => {
    try {
        // Aggregate total likes per collection name from Favorites
        const aggregates = await Favorite.aggregate([
            {
                $lookup: {
                    from: 'nfts',
                    localField: 'nft',
                    foreignField: '_id',
                    as: 'nft_obj'
                }
            },
            { $unwind: '$nft_obj' },
            {
                $group: {
                    _id: '$nft_obj.nft_collection',
                    total_likes: { $sum: 1 }
                }
            },
            { $sort: { total_likes: -1 } }
        ]);
        const results = [];
        for (const agg of aggregates) {
            if (!agg._id) continue;
            const collectionName = agg._id;
            const total_likes = agg.total_likes;
            const nfts_qs = await NFT.find({ nft_collection: collectionName });
            const total_items = nfts_qs.length;
            if (total_items === 0) continue;
            const floor_price = nfts_qs.filter(nft => nft.price != null).reduce((min, nft) => min === null ? nft.price : Math.min(min, nft.price), null);
            const owners_count = new Set(nfts_qs.map(nft => nft.owner_address)).size;
            const top_nft = nfts_qs[0];
            let image_url = null, banner_url = null, creator_address = '', total_volume = 0;
            const col = await Collection.findOne({ name: collectionName });
            if (col) {
                image_url = col.image_url || (top_nft ? top_nft.image_url : null);
                banner_url = col.banner_url;
                creator_address = col.creator_address;
                total_volume = col.total_volume || 0;
            } else {
                image_url = top_nft ? top_nft.image_url : null;
                banner_url = null;
                creator_address = top_nft ? top_nft.creator_address : '';
                // Optional: compute simple total volume across transactions for this collection
                total_volume = await Transaction.aggregate([
                    { $match: { 'nft.nft_collection': collectionName, transaction_type: { $in: ['buy', 'sale'] }, price: { $ne: null } } },
                    { $group: { _id: null, total: { $sum: '$price' } } }
                ]).then(res => res[0]?.total || 0);
            }
            results.push({
                name: collectionName,
                description: '',
                creator_address,
                image_url,
                banner_url,
                floor_price: floor_price !== null ? parseFloat(floor_price) : null,
                total_volume: parseFloat(total_volume),
                total_items,
                total_likes,
                owners_count
            });
        }
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCombinedNfts = async (req, res) => {
    try {
        const user_address = req.query.user_address;
        let liked_nft_ids = new Set();
        if (user_address) {
            const favorites = await Favorite.find({ user_address });
            liked_nft_ids = new Set(favorites.map(fav => fav.nft.toString()));
        }
        const local_nfts = await NFT.find().sort({ created_at: -1 }).limit(100);
        const local_nfts_data = await Promise.all(local_nfts.map(async (nft) => {
            const like_count = await Favorite.countDocuments({ nft: nft._id });
            return {
                id: `local_${nft._id}`,
                nft_address: `local_${nft._id}`, // Unique NFT identifier
                token_id: nft.token_id,
                name: nft.name,
                description: nft.description,
                image_url: nft.image_url,
                price: nft.price != null ? parseFloat(nft.price) : null,
                is_listed: nft.is_listed,
                is_auction: nft.is_auction,
                owner_address: nft.owner_address,
                creator_address: nft.creator_address,
                collection: nft.nft_collection || 'NFT Collection',
                category: nft.category,
                created_at: nft.created_at,
                source: 'local',
                liked: liked_nft_ids.has(nft._id.toString()),
                like_count
            };
        }));
        // Optional sorting
        const sort_key = req.query.sort;
        if (sort_key === 'likes') {
            local_nfts_data.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
        } else {
            // Shuffle for variety if no explicit sort
            for (let i = local_nfts_data.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [local_nfts_data[i], local_nfts_data[j]] = [local_nfts_data[j], local_nfts_data[i]];
            }
        }
        res.json({
            success: true,
            data: local_nfts_data,
            stats: {
                local_count: local_nfts_data.length,
                total_count: local_nfts_data.length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getNftDetail = async (req, res) => {
    try {
        const { token_id } = req.params;
        const nft = await NFT.findOne({ token_id });
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }
        let blockchain_data = null;
        try {
            blockchain_data = await web3Utils.getNftMetadata(token_id);
        } catch (e) {
            blockchain_data = null;
        }
        const nft_data = {
            id: nft._id,
            nft_address: `local_${nft._id}`, // Unique NFT identifier
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            token_uri: nft.token_uri,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_auction: nft.is_auction,
            auction_end_time: nft.auction_end_time || null,
            current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
            highest_bidder: nft.highest_bidder,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            royalty_percentage: nft.royalty_percentage != null ? parseFloat(nft.royalty_percentage) : null,
            collection: nft.nft_collection || 'NFT Collection',
            category: nft.category,
            created_at: nft.created_at,
            blockchain_data
        };
        res.json({ success: true, data: nft_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getNfts = async (req, res) => {

    try {
        let { page = 1, limit = 12, category, collection, price_min, price_max, sort_by = 'created_at', sort_order = 'desc' } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const query = {};
        if (category) query.category = category;
        if (collection) query.nft_collection = collection;
        if (price_min) query.price = { ...query.price, $gte: parseFloat(price_min) };
        if (price_max) query.price = { ...query.price, $lte: parseFloat(price_max) };
        let sort = {};
        sort[sort_by] = sort_order === 'desc' ? -1 : 1;
        const nfts = await NFT.find(query)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit);
        const total = await NFT.countDocuments(query);
        const nfts_data = nfts.map(nft => ({
            id: nft._id,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_auction: nft.is_auction,
            auction_end_time: nft.auction_end_time || null,
            current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
            highest_bidder: nft.highest_bidder,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.nft_collection || 'NFT Collection',
            category: nft.category,
            created_at: nft.created_at,
        }));

        res.json({
            success: true,
            data: nfts_data,
            pagination: {
                page,
                total_pages: Math.ceil(total / limit),
                total_items: total,
                has_next: page * limit < total,
                has_previous: page > 1
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getTrendingCollections = async (req, res) => {
    try {
        const collections = await Collection.find({ total_volume: { $gt: 0 } })
            .sort({ total_volume: -1 })
            .limit(10);
        const collections_data = collections.map(collection => ({
            id: collection._id,
            name: collection.name,
            description: collection.description,
            image_url: collection.image_url,
            floor_price: collection.floor_price != null ? parseFloat(collection.floor_price) : null,
            total_volume: collection.total_volume != null ? parseFloat(collection.total_volume) : 0,
            total_items: collection.total_items,
            created_at: collection.created_at,
        }));
        res.json({ success: true, data: collections_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getUserCreatedNfts = async (req, res) => {
    try {
        const { wallet_address } = req.params;
        const nfts = await NFT.find({ creator_address: wallet_address });
        const nfts_data = nfts.map(nft => ({
            id: nft._id,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_auction: nft.is_auction,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.nft_collection,
            category: nft.category,
            created_at: nft.created_at,
        }));
        res.json({ success: true, data: nfts_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getUserNfts = async (req, res) => {
    try {
        const { wallet_address } = req.params;
        const owned_nfts = await NFT.find({ owner_address: wallet_address });
        const created_nfts = await NFT.find({ creator_address: wallet_address });
        const nftMap = new Map();
        for (const nft of owned_nfts) {
            nftMap.set(nft.token_id, nft);
        }
        for (const nft of created_nfts) {
            nftMap.set(nft.token_id, nft);
        }
        const nfts = Array.from(nftMap.values());
        const nfts_data = nfts.map(nft => ({
            id: nft._id,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_auction: nft.is_auction,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.nft_collection,
            category: nft.category,
            created_at: nft.created_at,
        }));
        res.json({ success: true, data: nfts_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const searchNfts = async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query) {
            return res.status(400).json({ success: false, error: 'Search query is required' });
        }
        const nfts = await NFT.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { nft_collection: { $regex: query, $options: 'i' } }
            ]
        });
        const nfts_data = nfts.map(nft => ({
            id: nft._id,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.nft_collection,
            category: nft.category,
            created_at: nft.created_at,
        }));
        res.json({ success: true, data: nfts_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCollections = async (req, res) => {
    try {
        const collections = await Collection.find();
        const collections_data = collections.map(collection => ({
            id: collection._id,
            name: collection.name,
            description: collection.description,
            creator_address: collection.creator_address,
            image_url: collection.image_url,
            banner_url: collection.banner_url,
            floor_price: collection.floor_price != null ? parseFloat(collection.floor_price) : null,
            total_volume: collection.total_volume != null ? parseFloat(collection.total_volume) : 0,
            total_items: collection.total_items,
            created_at: collection.created_at,
        }));
        res.json({ success: true, data: collections_data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const setNftListed = async (req, res) => {
    try {
        const { token_id } = req.params;
        const nft = await NFT.findOne({ token_id });
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }
        // Check on-chain listing status
        const contract = await web3Utils.getNftMarketplaceContract();
        const is_listed = await contract.methods.isListed(token_id).call();
        if (is_listed) {
            nft.is_listed = true;
            await nft.save();
            return res.json({ success: true, is_listed: true });
        } else {
            return res.status(400).json({ success: false, error: 'NFT is not listed on-chain' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const setNftRentable = async (req, res) => {
    try {
        const { token_id } = req.params;
        const { is_rentable } = req.body;

        const nft = await NFT.findOne({ token_id });
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        nft.is_rentable = is_rentable;
        // If rentable, it's technically not "listed for sale" in the traditional sense, 
        // but we might want to keep is_listed false to avoid confusion in the marketplace
        if (is_rentable) {
            nft.is_listed = false;
        }

        await nft.save();
        return res.json({ success: true, is_rentable: nft.is_rentable });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const toggleNftLike = async (req, res) => {
    try {
        const { nft_id } = req.params;
        const { user_address } = req.body;
        if (!user_address) {
            return res.status(400).json({ success: false, error: 'User address required' });
        }
        let actual_id = nft_id;
        if (typeof nft_id === 'string' && nft_id.startsWith('local_')) {
            actual_id = nft_id.replace('local_', '');
        }
        let nft = await NFT.findById(actual_id);
        if (!nft) {
            nft = await NFT.findOne({ token_id: actual_id });
        }
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }
        let favorite = await Favorite.findOne({ user_address, nft: nft._id });
        let liked;
        if (favorite) {
            await favorite.deleteOne();
            liked = false;
            // Create unlike transaction
            await Transaction.create({
                transaction_hash: `unlike_${user_address}_${nft._id}_${Date.now()}`,
                nft: nft._id,
                from_address: user_address,
                to_address: nft.owner_address,
                transaction_type: 'unlike',
                price: null,
                timestamp: new Date(),
            });
        } else {
            await Favorite.create({ user_address, nft: nft._id });
            liked = true;
            // Create like transaction
            await Transaction.create({
                transaction_hash: `like_${user_address}_${nft._id}_${Date.now()}`,
                nft: nft._id,
                from_address: user_address,
                to_address: nft.owner_address,
                transaction_type: 'like',
                price: null,
                timestamp: new Date(),
            });
        }
        const like_count = await Favorite.countDocuments({ nft: nft._id });
        res.json({ success: true, liked, like_count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get contract information
export const getContractInfo = async (req, res) => {
    try {
        const contractInfo = await web3Utils.getContractInfo();
        return res.json({
            success: true,
            data: contractInfo
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Upload file to IPFS
export const uploadIpfs = async (req, res) => {
    try {
        console.log('[API] Starting IPFS upload request');
        console.log(`[API] Content type: ${req.headers['content-type']}`);
        console.log(`[API] Available files: ${Object.keys(req.files || {})}`);

        if (!req.files || !req.files.file) {
            console.log('[API] No file found in request');
            return res.status(400).json({
                success: false,
                error: 'No file provided'
            });
        }

        const file = req.files.file;
        console.log(`[API] File name: ${file.name}`);
        console.log(`[API] File size: ${file.size} bytes`);
        console.log(`[API] File mimetype: ${file.mimetype}`);

        const ipfsHash = await uploadToIPFS(file.data);

        return res.json({
            success: true,
            ipfsHash: ipfsHash
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get NFT by combined ID (handles local_ prefix)
// export const getNftByCombinedId = async (req, res) => {
//     try {
//         const { combined_id } = req.params;
//         console.log(`[DEBUG] getNftByCombinedId called with id: ${combined_id}`);

//         // Check if this is a local NFT (has "local_" prefix)
//         if (combined_id.startsWith('local_')) {
//             // Extract the actual ID from the local ID
//             const actualId = combined_id.replace('local_', '');
//             console.log(`[DEBUG] Local NFT detected, actualId: ${actualId}`);

//             try {
//                 // Try to find by database ID first, then by token_id
//                 let nft;
//                 try {
//                     nft = await NFT.findById(actualId);
//                 } catch {
//                     nft = await NFT.findOne({ token_id: actualId });
//                 }

//                 if (!nft) {
//                     return res.status(404).json({
//                         success: false,
//                         error: 'Local NFT not found'
//                     });
//                 }

//                 // Get blockchain data
//                 let blockchainData = null;
//                 try {
//                     blockchainData = await web3Utils.getNftMetadata(nft.token_id);
//                 } catch (e) {
//                     console.warn(`Could not fetch blockchain data: ${e.message}`);
//                     blockchainData = null;
//                 }

//                 const nftData = {
//                     id: `local_${nft._id}`,
//                     token_id: nft.token_id,
//                     name: nft.name,
//                     description: nft.description,
//                     image_url: nft.image_url,
//                     token_uri: nft.token_uri,
//                     price: nft.price != null ? parseFloat(nft.price) : null,
//                     is_listed: nft.is_listed,
//                     is_auction: nft.is_auction,
//                     auction_end_time: nft.auction_end_time || null,
//                     current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
//                     highest_bidder: nft.highest_bidder,
//                     owner_address: nft.owner_address,
//                     creator_address: nft.creator_address,
//                     royalty_percentage: nft.royalty_percentage != null ? parseFloat(nft.royalty_percentage) : null,
//                     collection: nft.nft_collection,
//                     category: nft.category,
//                     created_at: nft.created_at,
//                     blockchain_data: blockchainData,
//                     source: 'local'
//                 };

//                 return res.json({
//                     success: true,
//                     data: nftData
//                 });
//             } catch (error) {
//                 console.error(`[ERROR] Error finding local NFT: ${error}`);
//                 return res.status(404).json({
//                     success: false,
//                     error: 'Local NFT not found'
//                 });
//             }
//         } else {
//             // Only local NFTs are supported now
//             return res.status(404).json({
//                 success: false,
//                 error: 'Only local NFTs are supported'
//             });
//         }
//     } catch (error) {
//         console.error(`[ERROR] getNftByCombinedId: ${error}`);
//         return res.status(500).json({
//             success: false,
//             error: error.message
//         });
//     }
// };

export const getNftByCombinedId = async (req, res) => {
    try {
        const { combined_id } = req.params;
        const { user_address } = req.query; // Get user address from query params

        console.log(`[DEBUG] getNftByCombinedId called with id: ${combined_id}`);
        console.log(`[DEBUG] User address: ${user_address}`);

        // Check if this is a local NFT (has "local_" prefix)
        if (combined_id.startsWith('local_')) {
            const actualId = combined_id.replace('local_', '');
            console.log(`[DEBUG] Local NFT detected, actualId: ${actualId}`);

            try {
                // Try to find by database ID first, then by token_id
                let nft;
                try {
                    nft = await NFT.findById(actualId);
                } catch {
                    nft = await NFT.findOne({ token_id: actualId });
                }

                if (!nft) {
                    return res.status(404).json({
                        success: false,
                        error: 'Local NFT not found'
                    });
                }

                // Get blockchain data (with error handling)
                let blockchainData = null;
                try {
                    blockchainData = await web3Utils.getNftMetadata(nft.token_id);
                    console.log(`[DEBUG] Blockchain data retrieved:`, blockchainData);
                } catch (e) {
                    console.warn(`[WARN] Could not fetch blockchain data: ${e.message}`);
                    blockchainData = null;
                }

                // Check if user has liked this NFT
                let liked = false;
                if (user_address) {
                    try {
                        const like = await Favorite.findOne({
                            nft: nft._id,
                            user_address: user_address.toLowerCase()
                        });
                        liked = !!like;
                        console.log(`[DEBUG] Like status for user ${user_address}: ${liked}`);
                    } catch (e) {
                        console.warn(`[WARN] Could not check like status: ${e.message}`);
                    }
                }

                const nftData = {
                    id: `local_${nft._id}`,
                    nft_address: `local_${nft._id}`, // Unique NFT identifier
                    token_id: nft.token_id,
                    name: nft.name,
                    description: nft.description,
                    image_url: nft.image_url,
                    token_uri: nft.token_uri,
                    price: nft.price != null ? parseFloat(nft.price) : null,
                    is_listed: nft.is_listed,
                    is_auction: nft.is_auction,
                    auction_end_time: nft.auction_end_time || null,
                    current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
                    highest_bidder: nft.highest_bidder,
                    owner_address: nft.owner_address,
                    creator_address: nft.creator_address,
                    royalty_percentage: nft.royalty_percentage != null ? parseFloat(nft.royalty_percentage) : null,
                    collection: nft.nft_collection || 'NFT Collection',
                    category: nft.category,
                    created_at: nft.created_at,
                    blockchain_data: blockchainData,
                    source: 'local',
                    liked: liked // Add the liked status
                };

                console.log(`[DEBUG] Returning NFT data with liked: ${liked}`);

                return res.json({
                    success: true,
                    data: nftData
                });
            } catch (error) {
                console.error(`[ERROR] Error finding local NFT: ${error}`);
                return res.status(404).json({
                    success: false,
                    error: 'Local NFT not found'
                });
            }
        } else {
            // Only local NFTs are supported now
            return res.status(404).json({
                success: false,
                error: 'Only local NFTs are supported'
            });
        }
    } catch (error) {
        console.error(`[ERROR] getNftByCombinedId: ${error}`);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get NFT statistics
export const getNftStats = async (req, res) => {
    try {
        const { nft_id } = req.params;

        // Extract the actual NFT ID from combined ID
        let actualNftId = nft_id;
        if (nft_id.startsWith('local_')) {
            actualNftId = nft_id.replace('local_', '');
        }

        let nft;
        try {
            // Try to find by database ID first, then by token_id
            try {
                nft = await NFT.findById(actualNftId);
            } catch {
                nft = await NFT.findOne({ token_id: actualNftId });
            }
        } catch {
            return res.status(404).json({
                success: false,
                error: 'NFT not found'
            });
        }

        if (!nft) {
            return res.status(404).json({
                success: false,
                error: 'NFT not found'
            });
        }

        // Get likes count
        const likesCount = await Favorite.countDocuments({ nft: nft._id });

        // Get owners count (for now, just 1 since we don't track ownership history)
        const ownersCount = 1;

        // Get last sale info
        const lastSale = await Transaction.findOne({
            nft: nft._id,
            transaction_type: { $in: ['buy', 'sale'] }
        }).sort({ timestamp: -1 });

        let lastSaleInfo = 'No sales yet';
        if (lastSale && lastSale.price) {
            lastSaleInfo = `Ξ${parseFloat(lastSale.price)}`;
        }

        // Calculate total volume
        const totalVolumeResult = await Transaction.aggregate([
            {
                $match: {
                    nft: nft._id,
                    transaction_type: { $in: ['buy', 'sale'] },
                    price: { $ne: null }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$price' }
                }
            }
        ]);

        const totalVolume = totalVolumeResult.length > 0 ? totalVolumeResult[0].total : 0;
        const totalVolumeStr = totalVolume > 0 ? `Ξ${parseFloat(totalVolume)}` : '0 ETH';

        // Mock properties for now
        const properties = [];
        if (nft.description) {
            properties.push(
                { trait_type: 'Rarity', value: 'Common', rarity: '45%' },
                { trait_type: 'Category', value: nft.category || 'Art', rarity: '30%' },
                { trait_type: 'Collection', value: nft.nft_collection || 'NFT Collection', rarity: '25%' }
            );
        }

        // Get real views count
        const viewsCount = await NFTView.countDocuments({ nft: nft._id });

        const statsData = {
            views: viewsCount,
            likes: likesCount,
            owners: ownersCount,
            last_sale: lastSaleInfo,
            total_volume: totalVolumeStr,
            properties: properties
        };

        return res.json({
            success: true,
            data: statsData
        });

    } catch (error) {
        console.error(`[ERROR] getNftStats: ${error}`);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Track NFT view
export const trackNftView = async (req, res) => {
    try {
        const { nft_id } = req.params;

        // Get or create the NFT
        let nft;
        if (nft_id.startsWith('local_')) {
            const actualId = nft_id.replace('local_', '');
            try {
                nft = await NFT.findById(actualId);
            } catch {
                nft = await NFT.findOne({ token_id: actualId });
            }
        } else {
            nft = await NFT.findOne({ token_id: nft_id });
        }

        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        // Get viewer information
        const data = req.body || {};
        const viewerAddress = data.viewer_address;

        // Get IP address
        const xForwardedFor = req.headers['x-forwarded-for'];
        let ipAddress;
        if (xForwardedFor) {
            ipAddress = xForwardedFor.split(',')[0];
        } else {
            ipAddress = req.connection.remoteAddress || req.socket.remoteAddress ||
                (req.connection.socket ? req.connection.socket.remoteAddress : null);
        }

        // Get user agent
        const userAgent = req.headers['user-agent'] || '';

        // Create view record (will fail silently if duplicate due to unique constraint)
        try {
            await NFTView.create({
                nft: nft._id,
                viewer_address: viewerAddress,
                ip_address: ipAddress,
                user_agent: userAgent
            });
        } catch (viewError) {
            // This is expected for duplicate views
            console.log(`[INFO] Duplicate view or view creation failed: ${viewError.message}`);
        }

        // Return updated view count
        const viewCount = await NFTView.countDocuments({ nft: nft._id });

        return res.json({
            success: true,
            view_count: viewCount
        });

    } catch (error) {
        console.error(`[ERROR] trackNftView: ${error}`);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// Calculate loan details based on NFT value
const calculateLoanDetails = (nftPriceETH) => {
    // If no price, return null
    if (!nftPriceETH || nftPriceETH <= 0) {
        return null;
    }

    const ETH_TO_USD = 1700; // Convert ETH to USD (you can make this dynamic)
    const LTV_RATIO = 0.60; // 60% Loan-to-Value ratio (conservative)
    const ANNUAL_INTEREST_RATE = 0.03; // 3% APR

    const nftValueETH = parseFloat(nftPriceETH);
    const nftValueUSD = nftValueETH * ETH_TO_USD;

    // Calculate max loan amount (60% of NFT value)
    const maxLoanETH = nftValueETH * LTV_RATIO;
    const maxLoanUSD = nftValueUSD * LTV_RATIO;

    // Calculate interest for different loan periods
    const calculateInterestForPeriod = (principal, rate, months) => {
        const monthlyRate = rate / 12;
        const totalInterest = principal * monthlyRate * months;
        const totalRepayment = principal + totalInterest;
        const monthlyPayment = totalRepayment / months;

        return {
            total_interest: parseFloat(totalInterest.toFixed(4)),
            total_repayment: parseFloat(totalRepayment.toFixed(4)),
            monthly_payment: parseFloat(monthlyPayment.toFixed(4))
        };
    };

    return {
        nft_value: {
            eth: parseFloat(nftValueETH.toFixed(4)),
            usd: parseFloat(nftValueUSD.toFixed(2))
        },
        ltv_ratio: LTV_RATIO,
        ltv_percentage: `${(LTV_RATIO * 100).toFixed(0)}%`,
        max_loan: {
            eth: parseFloat(maxLoanETH.toFixed(4)),
            usd: parseFloat(maxLoanUSD.toFixed(2))
        },
        interest_rate: {
            annual: ANNUAL_INTEREST_RATE,
            annual_percentage: `${(ANNUAL_INTEREST_RATE * 100).toFixed(0)}%`,
            monthly: parseFloat((ANNUAL_INTEREST_RATE / 12).toFixed(4))
        },
        loan_terms: {
            '3_months': {
                period: '3 months',
                ...calculateInterestForPeriod(maxLoanETH, ANNUAL_INTEREST_RATE, 3),
                currency: 'ETH'
            },
            '6_months': {
                period: '6 months',
                ...calculateInterestForPeriod(maxLoanETH, ANNUAL_INTEREST_RATE, 6),
                currency: 'ETH'
            },
            '12_months': {
                period: '12 months',
                ...calculateInterestForPeriod(maxLoanETH, ANNUAL_INTEREST_RATE, 12),
                currency: 'ETH'
            }
        },
        liquidation_threshold: {
            ratio: 0.75, // 75% - if NFT value drops to 75% of original, liquidation may occur
            percentage: '75%',
            value_eth: parseFloat((nftValueETH * 0.75).toFixed(4)),
            value_usd: parseFloat((nftValueUSD * 0.75).toFixed(2))
        }
    };
};

// Get external NFT metadata from any contract
export const getExternalNft = async (req, res) => {
    try {
        // Support both POST (body) and GET (params)
        const contract_address = req.body.contract_address || req.params.contract;
        const token_id = req.body.token_id || req.params.tokenId;

        console.log(`[DEBUG] getExternalNft called with contract: ${contract_address}, token: ${token_id}`);

        if (!contract_address || !token_id) {
            return res.status(400).json({
                success: false,
                error: 'Both contract_address and token_id are required'
            });
        }

        // Always check internal database first for ANY contract
        // This handles NFTs that were minted through this platform
        console.log(`[DEBUG] Checking internal database for contract: ${contract_address}, token_id: ${token_id}`);
        // Match by BOTH token_id and contract_address to avoid collisions between
        // different NFT contracts (e.g. original collection vs WrappedLeasing wNFTs)
        const internalNft = await NFT.findOne({
            token_id: parseInt(token_id),
            contract_address: contract_address.toLowerCase()
        });

        if (internalNft) {
            console.log(`[DEBUG] Found NFT in internal database - Name: ${internalNft.name}`);

            // For marketplace contract NFTs, fetch fresh on-chain metadata
            console.log('[DEBUG] Checking if marketplace contract:', {
                web3UtilsAddress: web3Utils.contractAddress,
                requestAddress: contract_address.toLowerCase(),
                match: web3Utils.contractAddress && contract_address.toLowerCase() === web3Utils.contractAddress.toLowerCase()
            });

            if (web3Utils.contractAddress && contract_address.toLowerCase() === web3Utils.contractAddress.toLowerCase()) {
                console.log('[DEBUG] Marketplace NFT - fetching fresh on-chain metadata');
                try {
                    const onChainMeta = await web3Utils.contract.methods.getNFTMetadata(token_id).call();
                    console.log('[DEBUG] Fresh on-chain metadata:', onChainMeta);

                    internalNft.name = onChainMeta.name || onChainMeta[0];
                    internalNft.description = onChainMeta.description || onChainMeta[1];

                    const imageURI = onChainMeta.imageURI || onChainMeta[2];
                    if (imageURI) {
                        // Use robust IPFS resolution from web3Utils
                        const resolvedImage = web3Utils._resolveIPFS(imageURI);
                        console.log(`[DEBUG] Resolved image URL: ${resolvedImage} (from: ${imageURI})`);
                        internalNft.image_url = resolvedImage;
                        internalNft.token_uri = imageURI;
                    }

                    await internalNft.save();
                    console.log('[DEBUG] Database updated with fresh metadata');
                } catch (e) {
                    console.warn('[DEBUG] Failed to fetch fresh metadata:', e.message);
                }
            }

            // Calculate loan details based on NFT price
            const loanDetails = calculateLoanDetails(internalNft.price);

            // Return data from our database (most complete data)
            const formattedData = {
                id: `local_${internalNft._id}`,
                nft_address: `local_${internalNft._id}`,
                token_id: internalNft.token_id,
                name: internalNft.name,
                description: internalNft.description,
                image_url: internalNft.image_url,
                token_uri: internalNft.token_uri,
                owner_address: internalNft.owner_address,
                creator_address: internalNft.creator_address,
                collection: internalNft.nft_collection || 'NFT Collection',
                category: internalNft.category || 'Art',
                contract_address: contract_address,
                is_listed: internalNft.is_listed,
                is_auction: internalNft.is_auction,
                price: internalNft.price ? parseFloat(internalNft.price) : null,
                source: 'internal',
                blockchain_data: {
                    contract_address: contract_address,
                    token_id: token_id,
                    owner: internalNft.owner_address,
                },
                properties: [],
                collateral_lending: loanDetails // Add loan calculation details
            };

            return res.json({
                success: true,
                data: formattedData
            });
        }

        // If not in our database, fetch from blockchain (external NFT)
        console.log(`[DEBUG] NFT not in database, fetching from blockchain`);

        // Special case: if this is our own NFT marketplace contract, use its full ABI
        // to also read on-chain listing info reliably (price + isActive).
        let nftData;
        if (
            web3Utils.contractAddress &&
            contract_address.toLowerCase() === web3Utils.contractAddress.toLowerCase()
        ) {
            console.log('[DEBUG] Contract matches marketplace contractAddress; using on-chain marketplace helpers');
            try {
                // Basic metadata (tokenURI/owner) is already handled in web3Utils.getExternalNftMetadata
                // but we want full listing as in fetchNftDetails.js
                const meta = await web3Utils.getExternalNftMetadata(contract_address, token_id);
                nftData = meta;
            } catch (e) {
                console.warn('[DEBUG] Marketplace-specific metadata fetch failed, falling back to generic external metadata', e.message);
                nftData = await web3Utils.getExternalNftMetadata(contract_address, token_id);
            }
        } else {
            nftData = await web3Utils.getExternalNftMetadata(contract_address, token_id);
        }

        if (!nftData.success) {
            return res.status(404).json({
                success: false,
                error: 'NFT not found on blockchain'
            });
        }

        console.log(`[DEBUG] External NFT fetched - Name: ${nftData.name}, Image: ${nftData.image ? 'yes' : 'no'}`);

        // Derive listing / price info if available (e.g. our NFTMarketplace contract)
        let listing = nftData.listing || null;
        // If this is our main marketplace contract and listing is missing from generic path,
        // fetch it explicitly using the core marketplace ABI (more reliable).
        if (!listing && web3Utils.contractAddress &&
            contract_address.toLowerCase() === web3Utils.contractAddress.toLowerCase()) {
            try {
                const raw = await web3Utils.getOnChainListing(token_id);
                const rawPrice = raw.price || raw[1];
                const isActive = typeof raw.isActive !== 'undefined' ? raw.isActive : raw[2];
                const isAuction = typeof raw.isAuction !== 'undefined' ? raw.isAuction : raw[3];
                const priceEth = rawPrice && rawPrice !== '0'
                    ? web3Utils.web3.utils.fromWei(rawPrice.toString(), 'ether')
                    : null;
                listing = {
                    seller: raw.seller || raw[0],
                    priceEth,
                    isActive,
                    isAuction
                };
                console.log('[DEBUG] On-chain marketplace listing fetched in controller:', listing);
            } catch (e) {
                console.warn('[DEBUG] Failed to fetch on-chain listing in controller:', e.message);
            }
        }

        const priceEth = listing && listing.isActive && listing.priceEth
            ? parseFloat(listing.priceEth)
            : null;
        const isListed = !!(listing && listing.isActive && listing.priceEth);

        // Save to database so it appears in the marketplace
        // Use upsert to prevent duplicates
        try {
            const newNftData = {
                token_id: parseInt(token_id),
                contract_address: contract_address.toLowerCase(),
                name: nftData.name || `External NFT #${token_id}`,
                description: nftData.description || '',
                image_url: nftData.image || '',
                token_uri: nftData.token_uri || '',
                owner_address: nftData.owner_address,
                creator_address: nftData.owner_address, // Assume owner is creator for external
                nft_collection: nftData.collection_name || 'NFT Collection',
                category: 'External NFT',
                price: priceEth,
                is_listed: isListed,
                is_auction: listing ? !!listing.isAuction : false,
                // Don't overwrite existing creation date if it exists
            };

            const savedNft = await NFT.findOneAndUpdate(
                {
                    token_id: parseInt(token_id),
                    contract_address: contract_address.toLowerCase()
                },
                { $set: newNftData },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );

            console.log(`[DEBUG] External NFT saved/updated in database: ${savedNft._id}`);
        } catch (dbError) {
            console.error('[ERROR] Failed to save external NFT to database:', dbError);
            // Continue execution, don't fail the request just because save failed
        }

        const formattedData = {
            id: `external_${contract_address}_${token_id}`,
            nft_address: `${contract_address}:${token_id}`,
            token_id: parseInt(token_id),
            name: nftData.name,
            description: nftData.description,
            image_url: nftData.image,
            token_uri: nftData.token_uri,
            owner_address: nftData.owner_address,
            creator_address: nftData.owner_address, // For external NFTs, we assume owner is creator
            collection: nftData.collection_name,
            category: 'External NFT',
            contract_address: contract_address,
            is_listed: isListed,
            is_auction: listing ? !!listing.isAuction : false,
            price: priceEth,
            source: 'external',
            blockchain_data: {
                contract_address: contract_address,
                token_id: token_id,
                owner: nftData.owner_address,
                collection_name: nftData.collection_name,
                symbol: nftData.symbol,
                metadata: nftData.metadata
            },
            properties: nftData.attributes || [],
            collateral_lending: calculateLoanDetails(priceEth) // Add loan calculation for external NFTs too
        };

        return res.json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error(`[ERROR] getExternalNft: ${error}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch external NFT details'
        });
    }
};

export const createOffer = async (req, res) => {
    try {
        let { token_id } = req.params;
        const { from_address, price, transaction_hash, block_number, gas_used, gas_price } = req.body;

        console.log(`[DEBUG] createOffer called for token_id: ${token_id}`);
        console.log('[DEBUG] Offer data:', req.body);

        if (!from_address || !price) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Strip the "local_" prefix if present (frontend sends IDs like "local_694926a96d2b1e5de5217aa6")
        if (token_id.startsWith('local_')) {
            token_id = token_id.replace('local_', '');
            console.log(`[DEBUG] Stripped local_ prefix, new token_id: ${token_id}`);
        }

        // Find the NFT
        let nft = null;

        // Check if token_id is a valid number (for token_id lookup)
        if (!isNaN(token_id)) {
            nft = await NFT.findOne({ token_id: token_id });
        }

        // If not found by token_id, try by _id if it's a valid ObjectId
        if (!nft && mongoose.Types.ObjectId.isValid(token_id)) {
            nft = await NFT.findById(token_id);
        }

        if (!nft) {
            console.log(`[DEBUG] NFT not found for token_id: ${token_id}`);
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        // Create Transaction record
        const transaction = new Transaction({
            transaction_hash: transaction_hash || `OFFER_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Generate dummy hash if off-chain
            nft: nft._id,
            from_address: from_address.toLowerCase(),
            to_address: nft.owner_address.toLowerCase(),
            transaction_type: 'bid',
            price: price,
            block_number: block_number || 0,
            gas_used: gas_used || 0,
            gas_price: gas_price || 0,
            timestamp: new Date()
        });

        await transaction.save();
        console.log('[DEBUG] Offer transaction saved:', transaction._id);

        // Update current_bid on NFT if it's an auction and this is higher
        if (nft.is_auction && price > (nft.current_bid || 0)) {
            nft.current_bid = price;
            nft.highest_bidder = from_address.toLowerCase();
            await nft.save();
            console.log('[DEBUG] Updated NFT current_bid');
        }

        return res.status(201).json({
            success: true,
            data: transaction
        });

    } catch (error) {
        console.error('[ERROR] createOffer:', error);
        // Handle duplicate key error (if we generated a colliding hash, unlikely but possible)
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Duplicate transaction hash' });
        }
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Proxy image requests to bypass browser restrictions/CORS
 */
export const proxyImage = async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL parameter is required');
    }

    try {
        // Basic validation to prevent abuse
        // Allow IPFS gateways and standard image hosts
        const allowedDomains = [
            'ipfs.io',
            'gateway.pinata.cloud',
            'nftstorage.link',
            'dweb.link',
            'gateway.ipfs.io',
            'arweave.net'
        ];

        const targetUrl = new URL(url);
        const isAllowed = allowedDomains.some(domain => targetUrl.hostname.endsWith(domain));

        if (!isAllowed) {
            console.warn(`[Proxy] Blocked request to unauthorized domain: ${targetUrl.hostname}`);
            // Optional: return res.status(403).send('Domain not allowed');
            // For now, let's be permissive for debugging but log it
        }

        console.log(`[Proxy] Fetching image via axios: ${url}`);

        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 10000, // 10s timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Forward content type
        const contentType = response.headers['content-type'];
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }

        // Cache for performance (1 year)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        // Pipe the response stream to the client
        response.data.pipe(res);

    } catch (error) {
        console.error(`[Proxy] Error fetching image: ${error.message}`);
        if (error.response) {
            console.error(`[Proxy] Upstream status: ${error.response.status}`);
            return res.status(error.response.status).send(`Upstream error: ${error.response.statusText}`);
        }
        if (!res.headersSent) {
            res.status(500).send('Failed to proxy image');
        }
    }
};
