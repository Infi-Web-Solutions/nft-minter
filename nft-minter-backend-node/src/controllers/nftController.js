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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFile = path.join(__dirname, '../../sync_debug.log');

const log = (msg) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
    console.log(msg);
};

/**
 * Robustly find an NFT by either MongoDB _id (optionally prefixed with local_) 
 * or its numeric token_id.
 */
const findNftByIdOrTokenId = async (idOrTokenId) => {
    if (!idOrTokenId) return null;

    let id = idOrTokenId;
    if (typeof id === 'string') {
        if (id.startsWith('local_')) {
            id = id.replace('local_', '');
        } else if (id.startsWith('wrapped_')) {
            // For wrapped NFTs, we try to find the original NFT record if it exists
            // ID format: wrapped_{wId}
            const wId = id.replace('wrapped_', '');
            try {
                const WrappedNft = mongoose.model('WrappedNft');
                const wrapped = await WrappedNft.findOne({ wId: Number(wId) });
                if (wrapped) {
                    // Try to find the original NFT record by contract and tokenId
                    const originalNft = await NFT.findOne({
                        contract_address: { $regex: new RegExp(`^${wrapped.originalNftContract}$`, 'i') },
                        token_id: Number(wrapped.originalTokenId)
                    });
                    if (originalNft) return originalNft;
                }
            } catch (e) {
                console.warn(`[findNft] Wrapped resolution failed for ${id}: ${e.message}`);
            }
            // If we can't find original, just proceed with wId as id (might fall back to token_id search)
            id = wId;
        } else if (id.startsWith('external_')) {
            // ID format: external_{contract}_{tokenId}
            const parts = id.split('_');
            if (parts.length >= 3) {
                const contract = parts[1];
                const tokenId = parts[2];
                try {
                    const nft = await NFT.findOne({
                        contract_address: { $regex: new RegExp(`^${contract}$`, 'i') },
                        token_id: Number(tokenId)
                    });
                    if (nft) return nft;
                } catch (e) {
                    console.warn(`[findNft] External resolution failed for ${id}: ${e.message}`);
                }
                // Fallback to searching by token_id if contract lookup fails
                id = tokenId;
            }
        }
    }

    let nft = null;
    // 1. Try to find by MongoDB ObjectId if it looks like one
    if (mongoose.Types.ObjectId.isValid(id)) {
        try {
            nft = await NFT.findById(id);
        } catch (e) {
            console.warn(`[findNft] findById failed for ${id}: ${e.message}`);
        }
    }

    // 2. If not found, and it's a number, try to find by token_id
    if (!nft && !isNaN(id) && id.toString().trim() !== '') {
        try {
            nft = await NFT.findOne({ token_id: Number(id) });
        } catch (e) {
            console.warn(`[findNft] findOne by token_id failed for ${id}: ${e.message}`);
        }
    }

    return nft;
};

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

// Calculate Hamming distance between two hex strings
const hammingDistance = (hash1, hash2) => {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
        return 100; // Return high distance if invalid
    }
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        const val1 = parseInt(hash1[i], 16);
        const val2 = parseInt(hash2[i], 16);
        let xor = val1 ^ val2;
        while (xor) {
            distance += xor & 1;
            xor >>= 1;
        }
    }
    return distance;
};

const syncNftWithBlockchain = async (nft) => {
    try {
        if (!nft || !nft.token_id) {
            log(`[Sync] Skipping sync: nft or token_id missing. nft: ${!!nft}`);
            return nft;
        }

        log(`[Sync] Syncing NFT ${nft.token_id} with blockchain...`);
        const listing = await web3Utils.getOnChainListing(nft.token_id);
        log(`[Sync] On-chain listing for ${nft.token_id}: ${JSON.stringify(listing)}`);

        // listing structure: [seller, price, isActive, isAuction, auctionEndTime, startingPrice, highestBid, highestBidder]
        const isActive = listing.isActive !== undefined ? listing.isActive : listing[2];
        const onChainPrice = listing.price !== undefined ? listing.price : listing[1];
        const isAuction = listing.isAuction !== undefined ? listing.isAuction : listing[3];
        const auctionEndTime = listing.auctionEndTime !== undefined ? listing.auctionEndTime : listing[4];
        const isLeasing = listing.isLeasing || false;

        log(`[Sync] isActive: ${isActive}, onChainPrice: ${onChainPrice}, isAuction: ${isAuction}, isLeasing: ${isLeasing}`);

        let changed = false;

        if (nft.is_listed !== isActive) {
            log(`[Sync] Updating is_listed: ${nft.is_listed} -> ${isActive}`);
            nft.is_listed = isActive;
            changed = true;
        }

        // Update is_rentable based on leasing status
        if (isLeasing && !nft.is_rentable) {
            log(`[Sync] Updating is_rentable: ${nft.is_rentable} -> true (Leasing detected)`);
            nft.is_rentable = true;
            changed = true;
        } else if (!isLeasing && nft.is_rentable) {
            // CAUTION: It might be rentable but not yet transferred to contract?
            // For now, if we are strictly syncing on-chain state, if it's NOT in leasing contract, 
            // it might just be a regular NFT. But users can mark "rentable" without staking sometimes?
            // If we assume "locked in leasing marketplace" = "is_rentable" for the UI to picking it up...
            // Let's be safe: If isActive (Sales) is true, it certainly CANNOT be rentable (locked).
            if (isActive) {
                log(`[Sync] Updating is_rentable: ${nft.is_rentable} -> false (Active sales listing)`);
                nft.is_rentable = false;
                changed = true;
            }
        }

        if (isActive) {
            const priceEth = web3Utils.web3.utils.fromWei(onChainPrice, 'ether');
            if (nft.price !== parseFloat(priceEth)) {
                log(`[Sync] Updating price: ${nft.price} -> ${priceEth}`);
                nft.price = parseFloat(priceEth);
                changed = true;
            }

            if (nft.is_auction !== isAuction) {
                log(`[Sync] Updating is_auction: ${nft.is_auction} -> ${isAuction}`);
                nft.is_auction = isAuction;
                changed = true;
            }

            if (isAuction) {
                const endTimeDate = new Date(Number(auctionEndTime) * 1000);
                if (!nft.auction_end_time || nft.auction_end_time.getTime() !== endTimeDate.getTime()) {
                    log(`[Sync] Updating auction_end_time`);
                    nft.auction_end_time = endTimeDate;
                    changed = true;
                }
            }
        }

        // Also sync owner if possible
        try {
            const metadata = await web3Utils.getNftMetadata(nft.token_id);
            if (metadata && metadata.owner && nft.owner_address.toLowerCase() !== metadata.owner.toLowerCase()) {
                log(`[Sync] Updating owner: ${nft.owner_address} -> ${metadata.owner}`);
                nft.owner_address = metadata.owner;
                changed = true;
            }
        } catch (e) {
            log(`[Sync] Failed to sync owner: ${e.message}`);
        }

        if (changed) {
            await nft.save();
            log(`[Sync] NFT ${nft.token_id} updated in database`);
        } else {
            log(`[Sync] No changes for NFT ${nft.token_id}`);
        }

        return nft;
    } catch (error) {
        log(`[Sync] Error syncing NFT ${nft.token_id}: ${error.message}`);
        return nft;
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
                nft_collection: data.collection || 'NFT Marketplace',
                category: data.category,
                perceptual_hash: data.perceptual_hash || null,
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

        const nft = await findNftByIdOrTokenId(token_id);
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

        // Execute the buy transaction using the real token_id from DB
        const tx = await web3Utils.buyNFT(nft.token_id, buyer_address);
        const receipt = await web3Utils.waitForTransaction(tx);

        // Update NFT owner in database
        const oldOwner = nft.owner_address;
        nft.owner_address = buyer_address;
        nft.is_listed = false;
        nft.is_rentable = false;
        nft.is_rented = false;
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

        // Get the new owner from blockchain using real token_id
        const newOwner = await web3Utils.getNftOwner(nft?.token_id || token_id);
        if (!newOwner) {
            return res.status(400).json({ success: false, error: 'Could not fetch new owner from blockchain' });
        }

        const nft = await findNftByIdOrTokenId(token_id);
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }
        const oldOwner = nft.owner_address;

        if (oldOwner.toLowerCase() === newOwner.toLowerCase()) {
            return res.json({ success: true, owner_address: newOwner, message: 'Owner already updated' });
        }

        // Update NFT in database
        nft.owner_address = newOwner;
        nft.is_listed = false; // Assuming buy removes listing
        nft.is_rentable = false;
        nft.is_rented = false;
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

        // Build dynamic query
        const query = {};
        const { status, collection, blockchain, price_min, price_max } = req.query;

        // Status Filters
        const statusFilters = status ? (Array.isArray(status) ? status : [status]) : [];
        if (statusFilters.length > 0) {
            const orConditions = [];

            if (statusFilters.includes('Buy Now')) {
                orConditions.push({ is_listed: true, is_auction: false });
            }
            if (statusFilters.includes('On Auction')) {
                orConditions.push({ is_auction: true }); // Listing might be handled by is_listed=true + is_auction=true
            }
            if (statusFilters.includes('On Rent') || statusFilters.includes('Rented')) {
                // "On Rent" in UI often means "Listed for Rent" or "Currently Rented"
                // For simplified backend logic, we assume is_rentable means "Available for Rent"
                // And we check validation for "Rented" if we had that state stored clearly.
                // For now, we allow is_rentable=true items.
                orConditions.push({ is_rentable: true });
            }
            if (statusFilters.includes('New')) {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                // "New" should probably be combined with other availabilities, 
                // but typically it means "New AND Listed".
                // However, following the $or pattern, it might suggest "New OR Buy Now".
                // Frontend logic typically creates an intersection or union depending on UI.
                // Assuming Union ($or) for status checkboxes is standard.
                orConditions.push({ created_at: { $gte: sevenDaysAgo }, is_listed: true });
            }

            if (orConditions.length > 0) {
                query.$or = orConditions;
            }
        } else {
            // Default: Show listed items OR rentable items
            query.$or = [
                { is_listed: true },
                { is_rentable: true },
                { is_rented: true }
            ];
        }

        // Collection Filter
        if (collection) {
            const collections = Array.isArray(collection) ? collection : [collection];
            query.nft_collection = { $in: collections };
        }

        // Price Filter
        if (price_min || price_max) {
            query.price = {};
            if (price_min) query.price.$gte = parseFloat(price_min);
            if (price_max) query.price.$lte = parseFloat(price_max);
        }

        let liked_nft_ids = new Set();
        if (user_address) {
            const favorites = await Favorite.find({ user_address });
            liked_nft_ids = new Set(favorites.map(fav => fav.nft.toString()));
        }

        // Sorting
        const sort_by = req.query.sort_by || 'recent';
        let sort = {};
        if (sort_by === 'price-low') sort.price = 1;
        else if (sort_by === 'price-high') sort.price = -1;
        else if (sort_by === 'most-liked') sort.like_count = -1; // Note: like_count not stored on NFT, might need aggregation
        else sort.created_at = -1; // Default recent

        console.log('[nftController] getCombinedNfts Query:', JSON.stringify(query, null, 2));

        const local_nfts = await NFT.find(query).sort(sort).limit(100);

        // Load WrappedNft model for checking status
        const wrappedNftModule = await import('../models/wrappedNft.js');
        const WrappedNft = wrappedNftModule.default;
        const wLeasingAddr = process.env.WrappedLeasing_Address;

        const local_nfts_data = (await Promise.all(local_nfts.map(async (nft) => {
            // Check if this NFT is actually a wrapped NFT that has expired
            // (In case some are tracked as local NFTs)
            if (wLeasingAddr && nft.nft_collection === 'Wrapped NFT') {
                const wNft = await WrappedNft.findOne({
                    originalNftContract: nft.creator_address, // In some cases creator stores original contract
                    originalTokenId: nft.token_id,
                    status: { $ne: 'Active' }
                });
                if (wNft) return null;
            }

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
                is_rentable: nft.is_rentable || false,
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
        }))).filter(n => n !== null);

        // Optional sorting
        // Sorting handled in DB query
        if (req.query.sort_by === 'most-liked') {
            local_nfts_data.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
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
        const nft = await findNftByIdOrTokenId(token_id);

        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        // Sync with blockchain before returning
        nft = await syncNftWithBlockchain(nft);
        let blockchain_data = null;
        try {
            blockchain_data = await web3Utils.getNftMetadata(nft.token_id);
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
            is_rentable: nft.is_rentable || false,
            is_auction: nft.is_auction,
            auction_end_time: nft.auction_end_time || null,
            current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
            highest_bidder: nft.highest_bidder,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            royalty_percentage: nft.royalty_percentage != null ? parseFloat(nft.royalty_percentage) : null,
            collection: nft.nft_collection || 'NFT Marketplace',
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
        const query = { is_listed: true };
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
            is_rentable: nft.is_rentable || false,
            is_auction: nft.is_auction,
            auction_end_time: nft.auction_end_time || null,
            current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
            highest_bidder: nft.highest_bidder,
            owner_address: nft.owner_address,
            creator_address: nft.creator_address,
            collection: nft.nft_collection || 'NFT Marketplace',
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
        const nfts = await NFT.find({ creator_address: { $regex: new RegExp(`^${wallet_address}$`, 'i') } });
        const nfts_data = nfts.map(nft => ({
            id: nft._id,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_rentable: nft.is_rentable || false,
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
        const owned_nfts = await NFT.find({ owner_address: { $regex: new RegExp(`^${wallet_address}$`, 'i') } });
        const created_nfts = await NFT.find({ creator_address: { $regex: new RegExp(`^${wallet_address}$`, 'i') } });
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
            is_rentable: nft.is_rentable || false,
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
            ],
            is_listed: true
        });
        const nfts_data = nfts.map(nft => ({
            id: nft._id,
            token_id: nft.token_id,
            name: nft.name,
            description: nft.description,
            image_url: nft.image_url,
            price: nft.price != null ? parseFloat(nft.price) : null,
            is_listed: nft.is_listed,
            is_rentable: nft.is_rentable || false,
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
        const nft = await findNftByIdOrTokenId(token_id);

        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        // Check on-chain listing status using the real token_id
        const contract = web3Utils.contract;
        console.log(`[setNftListed] Fetching on-chain listing for token_id: ${nft.token_id}`);

        // Add a small delay to ensure the blockchain state is updated
        await new Promise(resolve => setTimeout(resolve, 2000));

        const listing = await contract.methods.getListing(nft.token_id).call();
        console.log(`[setNftListed] On-chain listing for ${nft.token_id}:`, listing);

        // listing structure: [seller, price, isActive, isAuction, auctionEndTime, startingPrice, highestBid, highestBidder]
        // Web3.js returns an object with both numeric and named keys
        const isActive = listing.isActive !== undefined ? listing.isActive : listing[2];

        if (isActive) {
            nft.is_listed = true;
            nft.is_auction = listing.isAuction !== undefined ? listing.isAuction : listing[3];
            const priceWei = listing.price !== undefined ? listing.price : listing[1];
            nft.price = web3Utils.web3.utils.fromWei(priceWei, 'ether');

            if (nft.is_auction) {
                const endTime = listing.auctionEndTime !== undefined ? listing.auctionEndTime : listing[4];
                nft.auction_end_time = new Date(Number(endTime) * 1000);
            }

            await nft.save();
            console.log(`[setNftListed] Successfully updated NFT ${token_id} in DB`);

            return res.json({
                success: true,
                is_listed: true,
                is_auction: nft.is_auction,
                price: nft.price
            });
        } else {
            console.log(`[setNftListed] NFT ${token_id} is NOT listed on-chain. Updating DB...`);
            // If not active on-chain, ensure it's marked as not listed in DB
            nft.is_listed = false;
            await nft.save();
            return res.json({
                success: true,
                is_listed: false,
                message: 'NFT is not listed on-chain. Database updated.'
            });
        }
    } catch (error) {
        console.error('[ERROR] setNftListed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const setNftRentable = async (req, res) => {
    try {
        const { token_id } = req.params;
        const { is_rentable } = req.body;

        let nft = await findNftByIdOrTokenId(token_id);
        if (!nft) {
            // Support for external/wrapped ID auto-discovery
            if (token_id.startsWith('external_') || token_id.startsWith('wrapped_')) {
                console.log(`[setNftRentable] Auto-discovering NFT for ID ${token_id}`);
                try {
                    let contract_address, actual_token_id;
                    if (token_id.startsWith('external_')) {
                        const parts = token_id.split('_');
                        contract_address = parts[1];
                        actual_token_id = parts[2];
                    } else {
                        const wId = token_id.replace('wrapped_', '');
                        const WrappedNftModel = mongoose.model('WrappedNft');
                        const wrapped = await WrappedNftModel.findOne({ wId: Number(wId) });
                        if (wrapped) {
                            contract_address = wrapped.originalNftContract;
                            actual_token_id = wrapped.originalTokenId;
                        }
                    }

                    if (contract_address && actual_token_id) {
                        const nftData = await web3Utils.getExternalNftMetadata(contract_address, actual_token_id);
                        if (nftData.success) {
                            nft = new NFT({
                                contract_address: contract_address.toLowerCase(),
                                token_id: Number(actual_token_id),
                                name: nftData.name,
                                description: nftData.description,
                                image_url: nftData.image,
                                token_uri: nftData.token_uri,
                                owner_address: nftData.owner_address,
                                creator_address: nftData.owner_address,
                                nft_collection: nftData.collection_name || 'External Collection',
                                category: 'Art',
                                is_listed: false,
                                is_rentable: is_rentable
                            });
                            await nft.save();
                            console.log(`[setNftRentable] Created new record for discovered NFT ${actual_token_id}`);
                        }
                    }
                } catch (e) {
                    console.warn(`[setNftRentable] Auto-discovery failed: ${e.message}`);
                }
            }

            if (!nft) {
                return res.status(404).json({ success: false, error: 'NFT not found' });
            }
        } else {
            nft.is_rentable = is_rentable;
            // If rentable, it's technically not "listed for sale" in the traditional sense, 
            // but we might want to keep is_listed false to avoid confusion in the marketplace
            if (is_rentable) {
                nft.is_listed = false;
            }
            await nft.save();
        }

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
        const nft = await findNftByIdOrTokenId(nft_id);
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

import RentalTransaction from '../models/rentalTransaction.js';
import WrappedNft from '../models/wrappedNft.js';

export const getNftByCombinedId = async (req, res) => {
    try {
        const { combined_id } = req.params;
        const { user_address } = req.query; // Get user address from query params

        log(`[DEBUG] getNftByCombinedId called with id: ${combined_id}`);
        if (user_address) log(`[DEBUG] User address: ${user_address}`);

        // Check if this is a local NFT (has "local_" prefix)
        if (combined_id.startsWith('local_')) {
            const actualId = combined_id.replace('local_', '');
            log(`[DEBUG] Local NFT detected, actualId: ${actualId}`);

            try {
                let nft = await findNftByIdOrTokenId(combined_id);
                if (!nft) {
                    log(`[DEBUG] NFT not found for id: ${combined_id} (actualId: ${actualId})`);

                    // Try to debug why
                    if (mongoose.Types.ObjectId.isValid(actualId)) {
                        const directFind = await NFT.findById(actualId);
                        log(`[DEBUG] Direct findById('${actualId}') result: ${directFind ? 'FOUND' : 'NULL'}`);
                    } else {
                        log(`[DEBUG] '${actualId}' is NOT a valid ObjectId`);
                    }

                    return res.status(404).json({
                        success: false,
                        error: 'NFT not found'
                    });
                }

                // Sync with blockchain before returning
                nft = await syncNftWithBlockchain(nft);

                // Get blockchain data (with error handling)
                let blockchainData = null;
                try {
                    blockchainData = await web3Utils.getNftMetadata(nft.token_id);
                    log(`[DEBUG] Blockchain data retrieved for token ${nft.token_id}`);
                } catch (e) {
                    log(`[WARN] Could not fetch blockchain data: ${e.message}`);
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
                    } catch (e) {
                        log(`[WARN] Could not check like status: ${e.message}`);
                    }
                }

                // Resolve wId if rented
                let wId = null;
                if (nft.is_rented) {
                    try {
                        const wrapped = await WrappedNft.findOne({
                            originalNftContract: { $regex: new RegExp(`^${nft.contract_address}$`, 'i') },
                            originalTokenId: nft.token_id,
                            status: 'Active'
                        }).sort({ createdAt: -1 });
                        if (wrapped) {
                            wId = wrapped.wId;
                        }
                    } catch (e) {
                        log(`[WARN] Could not resolve wId: ${e.message}`);
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
                    is_rentable: nft.is_rentable || false,
                    is_auction: nft.is_auction,
                    auction_end_time: nft.auction_end_time || null,
                    current_bid: nft.current_bid != null ? parseFloat(nft.current_bid) : null,
                    highest_bidder: nft.highest_bidder,
                    owner_address: nft.owner_address,
                    creator_address: nft.creator_address,
                    royalty_percentage: nft.royalty_percentage != null ? parseFloat(nft.royalty_percentage) : null,
                    is_rented: nft.is_rented || false,
                    wId: wId,
                    collection: nft.nft_collection || 'NFT Collection',
                    category: nft.category,
                    created_at: nft.created_at,
                    blockchain_data: blockchainData,
                    source: 'local',
                    liked: liked // Add the liked status
                };

                return res.json({
                    success: true,
                    data: nftData
                });
            } catch (error) {
                log(`[ERROR] Error finding local NFT: ${error}`);
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

        const nft = await findNftByIdOrTokenId(nft_id);
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

        const nft = await findNftByIdOrTokenId(nft_id);
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

        // Match by BOTH token_id and contract_address to avoid collisions
        // Use a more robust check that handles potential local_ prefixes if sent accidentally
        let internalNft = await NFT.findOne({
            token_id: isNaN(token_id) ? -1 : Number(token_id),
            contract_address: { $regex: new RegExp(`^${contract_address}$`, 'i') }
        });

        // Fallback: If not found by numeric token_id but looks like a local ID
        if (!internalNft) {
            internalNft = await findNftByIdOrTokenId(token_id);
            // Verify contract address matches if we found it via findNftByIdOrTokenId
            if (internalNft && internalNft.contract_address.toLowerCase() !== contract_address.toLowerCase()) {
                internalNft = null;
            }
        }

        if (internalNft) {
            console.log(`[DEBUG] Found NFT in internal database - Name: ${internalNft.name}`);

            // Fetch fresh on-chain data to ensure owner and listing status are correct
            try {
                const onChainData = await web3Utils.getExternalNftMetadata(contract_address, token_id);
                if (onChainData.success) {
                    console.log(`[DEBUG] Syncing internal NFT with on-chain owner: ${onChainData.owner_address}`);
                    internalNft.owner_address = onChainData.owner_address || internalNft.owner_address;

                    // Sync listing status if available
                    if (onChainData.listing) {
                        internalNft.is_listed = onChainData.listing.isActive;
                        if (onChainData.listing.priceEth) {
                            internalNft.price = onChainData.listing.priceEth;
                        }
                    }

                    // Sync rentable status from on-chain ownership
                    if (onChainData.is_rentable_on_chain) {
                        internalNft.is_rentable = true;
                    } else if (onChainData.owner_address && web3Utils.leasingMarketplaceAddress &&
                        onChainData.owner_address.toLowerCase() !== web3Utils.leasingMarketplaceAddress.toLowerCase()) {
                        internalNft.is_rentable = false;
                    }

                    // For our own marketplace contract, we can also sync metadata fields
                    if (web3Utils.contractAddress && contract_address.toLowerCase() === web3Utils.contractAddress.toLowerCase()) {
                        if (onChainData.name) internalNft.name = onChainData.name;
                        if (onChainData.description) internalNft.description = onChainData.description;
                        if (onChainData.image) internalNft.image_url = onChainData.image;
                    }

                    await internalNft.save();
                    console.log('[DEBUG] Internal NFT synced with blockchain');
                }
            } catch (syncErr) {
                console.warn(`[DEBUG] Failed to sync internal NFT with blockchain: ${syncErr.message}`);
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
                collection: internalNft.nft_collection || 'NFT Marketplace',
                category: internalNft.category || 'Art',
                contract_address: contract_address,
                is_listed: internalNft.is_listed,
                is_auction: internalNft.is_auction,
                is_rentable: internalNft.is_rentable || false,
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

        // REMOVED: Auto-save to database. 
        // We now only save when a user explicitly interacts (e.g. creates a loan).
        // This prevents the marketplace from being flooded with searched NFTs.

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
            is_rentable: nftData.is_rentable_on_chain || false,
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
        const nft = await findNftByIdOrTokenId(token_id);

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
 * End an auction and transfer NFT to winner
 */
export const endAuction = async (req, res) => {
    try {
        const { token_id } = req.params;
        const { transaction_hash, winner, final_price } = req.body;

        console.log(`[endAuction] Finalizing auction for token: ${token_id}`);
        console.log(`[endAuction] Params:`, { transaction_hash, winner, final_price });

        // Find the NFT
        const nft = await findNftByIdOrTokenId(token_id);

        if (!nft) {
            console.error(`[endAuction] NFT not found for token_id: ${token_id}`);
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        console.log(`[endAuction] Found NFT: ${nft.name} (ID: ${nft._id})`);

        // Verify the transaction if hash is provided
        if (transaction_hash) {
            try {
                console.log(`[endAuction] Verifying transaction: ${transaction_hash}`);
                const receipt = await web3Utils.web3.eth.getTransactionReceipt(transaction_hash);
                if (!receipt) {
                    console.warn(`[endAuction] Transaction receipt not found yet for: ${transaction_hash}`);
                } else if (!receipt.status) {
                    console.error(`[endAuction] Transaction failed on-chain: ${transaction_hash}`);
                    return res.status(400).json({
                        success: false,
                        error: 'Transaction failed on-chain'
                    });
                } else {
                    console.log(`[endAuction] Transaction confirmed!`);
                }
            } catch (error) {
                console.error('[endAuction] Transaction verification error:', error);
            }
        }

        const oldOwner = nft.owner_address;
        let newOwner = winner;

        // Wait a moment for blockchain state to propagate before fetching metadata
        console.log(`[endAuction] Waiting 2 seconds for state propagation...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Robust check: Fetch current owner from blockchain
        try {
            console.log(`[endAuction] Fetching current owner from blockchain for token ${token_id}...`);
            const blockchainMetadata = await web3Utils.getNftMetadata(nft.token_id);
            if (blockchainMetadata && blockchainMetadata.owner) {
                console.log(`[endAuction] Blockchain owner: ${blockchainMetadata.owner}`);
                newOwner = blockchainMetadata.owner;
            }
        } catch (error) {
            console.warn(`[endAuction] Could not fetch owner from blockchain: ${error.message}. Using provided winner.`);
        }

        // Update NFT ownership if we have a valid owner
        if (newOwner && newOwner !== '0x0000000000000000000000000000000000000000') {
            console.log(`[endAuction] Updating owner from ${oldOwner} to ${newOwner}`);
            nft.owner_address = newOwner;

            // Update user profile stats
            try {
                await UserProfile.findOneAndUpdate(
                    { wallet_address: newOwner.toLowerCase() },
                    { $inc: { total_collected: 1 } },
                    { upsert: true }
                );

                if (oldOwner) {
                    await UserProfile.findOneAndUpdate(
                        { wallet_address: oldOwner.toLowerCase() },
                        { $inc: { total_volume: Number(final_price) || 0 } },
                        { upsert: true }
                    );
                }
            } catch (err) {
                console.error(`[endAuction] Error updating user profiles:`, err);
            }
        } else {
            console.log(`[endAuction] No winner or zero address winner. NFT remains with ${oldOwner} or marketplace.`);
        }

        // Mark auction as ended in DB
        nft.is_listed = false;
        nft.is_auction = false;
        nft.updated_at = Date.now();

        await nft.save();
        console.log(`[endAuction] NFT updated successfully in database`);

        // Create transaction record
        if (transaction_hash && winner) {
            const transactionData = {
                transaction_hash,
                nft: nft._id,
                from_address: oldOwner,
                to_address: winner,
                transaction_type: 'auction_end',
                price: final_price || 0,
                timestamp: new Date(),
            };

            await Transaction.create(transactionData);
        }

        console.log('[endAuction] Auction ended successfully');
        return res.json({
            success: true,
            message: 'Auction ended successfully',
            new_owner: nft.owner_address
        });

    } catch (error) {
        console.error('[endAuction] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
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
