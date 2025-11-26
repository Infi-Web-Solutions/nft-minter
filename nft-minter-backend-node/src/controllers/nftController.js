import NFT from '../models/nft.js';
import Transaction from '../models/transaction.js';
import web3Utils from '../utils/web3Utils.js';
import UserProfile from '../models/userProfile.js';
import Favorite from '../models/favorite.js';
import Collection from '../models/collection.js';
import NFTView from '../models/nftView.js';
import { uploadToIPFS } from '../utils/ipfsUtils.js';

export const registerNft = async (req, res) => {
    try {
        const data = req.body;
        console.log("data regiester nft", data)
        const nft = await NFT.findOneAndUpdate(
            { token_id: data.token_id },
            {
                name: data.name,
                description: data.description,
                image_url: data.image_url,
                token_uri: data.token_uri || '',
                creator_address: data.creator_address,
                owner_address: data.owner_address,
                price: data.price,
                is_listed: data.is_listed || false,
                is_auction: data.is_auction || false,
                nft_collection: data.collection,
                category: data.category,
            },
            { new: true, upsert: true }
        );

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
        const local_nfts = await NFT.find().limit(50);
        const local_nfts_data = await Promise.all(local_nfts.map(async (nft) => {
            const like_count = await Favorite.countDocuments({ nft: nft._id });
            return {
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
                collection: nft.nft_collection,
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
            collection: nft.nft_collection,
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
            collection: nft.nft_collection,
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
                    collection: nft.nft_collection,
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
                { trait_type: 'Collection', value: nft.nft_collection || 'Unknown', rarity: '25%' }
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
