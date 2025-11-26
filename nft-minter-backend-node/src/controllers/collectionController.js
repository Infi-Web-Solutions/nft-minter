import Collection from '../models/collection.js';
import NFT from '../models/nft.js';
import Transaction from '../models/transaction.js';
import Favorite from '../models/favorite.js';

// Create a new collection
export const createCollection = async (req, res) => {
    try {
        const { name, description, creator_address, image_url, banner_url } = req.body;
        const newCollection = new Collection({
            name,
            description,
            creator_address,
            image_url,
            banner_url,
        });
        await newCollection.save();
        res.status(201).json({ success: true, data: newCollection });
    } catch (error) {
        console.error('[ERROR] createCollection:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get all collections
export const getAllCollections = async (req, res) => {
    try {
        const collections = await Collection.find();
        res.status(200).json({ success: true, data: collections });
    } catch (error) {
        console.error('[ERROR] getAllCollections:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get a collection by ID
export const getCollectionById = async (req, res) => {
    try {
        const collection = await Collection.findById(req.params.id);
        if (!collection) {
            return res.status(404).json({ success: false, error: 'Collection not found' });
        }
        res.status(200).json({ success: true, data: collection });
    } catch (error) {
        console.error('[ERROR] getCollectionById:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update a collection by ID
export const updateCollection = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const collection = await Collection.findByIdAndUpdate(id, updates, { new: true });
        if (!collection) {
            return res.status(404).json({ success: false, error: 'Collection not found' });
        }
        
        res.json({ success: true, data: collection });
    } catch (error) {
        console.error('[ERROR] updateCollection:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Delete a collection by ID
export const deleteCollection = async (req, res) => {
    try {
        const { id } = req.params;
        
        const collection = await Collection.findByIdAndDelete(id);
        if (!collection) {
            return res.status(404).json({ success: false, error: 'Collection not found' });
        }
        
        res.json({ success: true, message: 'Collection deleted successfully' });
    } catch (error) {
        console.error('[ERROR] deleteCollection:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get trending collections
export const getTrendingCollections = async (req, res) => {
    try {
        // Aggregate total volume per collection from transactions
        const volumeAggregates = await Transaction.aggregate([
            {
                $match: {
                    transaction_type: { $in: ['buy', 'sale'] },
                    price: { $exists: true, $ne: null }
                }
            },
            {
                $lookup: {
                    from: 'nfts',
                    localField: 'nft',
                    foreignField: '_id',
                    as: 'nft'
                }
            },
            {
                $unwind: '$nft'
            },
            {
                $group: {
                    _id: '$nft.collection',
                    total_volume: { $sum: '$price' }
                }
            },
            {
                $match: {
                    total_volume: { $gt: 0 }
                }
            },
            {
                $sort: { total_volume: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Get collection details
        const collectionsData = [];
        for (const agg of volumeAggregates) {
            const collectionName = agg._id;
            if (!collectionName) continue;

            // Get NFTs for this collection to derive details
            const nfts = await NFT.find({ collection: collectionName });
            if (nfts.length === 0) continue;

            const totalItems = nfts.length;
            const prices = nfts.map(n => n.price).filter(p => p != null);
            const floorPrice = prices.length > 0 ? Math.min(...prices) : null;

            // Use the most recent NFT image as collection image
            const topNft = nfts.sort((a, b) => b.created_at - a.created_at)[0];
            const imageUrl = topNft?.image_url || null;

            collectionsData.push({
                name: collectionName,
                description: '',
                image_url: imageUrl,
                floor_price: floorPrice,
                total_volume: agg.total_volume,
                total_items: totalItems,
            });
        }

        res.status(200).json({ success: true, data: collectionsData });
    } catch (error) {
        console.error('[ERROR] getTrendingCollections:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get collections by likes
export const getCollectionsByLikes = async (req, res) => {
    try {
        // Aggregate total likes per collection from favorites
        const likeAggregates = await Favorite.aggregate([
            {
                $lookup: {
                    from: 'nfts',
                    localField: 'nft',
                    foreignField: '_id',
                    as: 'nft'
                }
            },
            {
                $unwind: '$nft'
            },
            {
                $group: {
                    _id: '$nft.collection',
                    total_likes: { $sum: 1 }
                }
            },
            {
                $sort: { total_likes: -1 }
            }
        ]);

        const results = [];
        for (const agg of likeAggregates) {
            const collectionName = agg._id;
            if (!collectionName) continue;

            const totalLikes = agg.total_likes;

            // Get NFTs for this collection
            const nfts = await NFT.find({ collection: collectionName });
            if (nfts.length === 0) continue;

            const totalItems = nfts.length;
            const prices = nfts.map(n => n.price).filter(p => p != null);
            const floorPrice = prices.length > 0 ? Math.min(...prices) : null;

            // Distinct owners
            const ownersCount = new Set(nfts.map(n => n.owner_address)).size;

            // Use the most recent NFT image
            const topNft = nfts.sort((a, b) => b.created_at - a.created_at)[0];
            const imageUrl = topNft?.image_url || null;

            // Compute total volume from transactions
            const volumeAgg = await Transaction.aggregate([
                {
                    $match: {
                        transaction_type: { $in: ['buy', 'sale'] },
                        price: { $exists: true, $ne: null }
                    }
                },
                {
                    $lookup: {
                        from: 'nfts',
                        localField: 'nft',
                        foreignField: '_id',
                        as: 'nft'
                    }
                },
                {
                    $unwind: '$nft'
                },
                {
                    $match: { 'nft.collection': collectionName }
                },
                {
                    $group: {
                        _id: null,
                        total_volume: { $sum: '$price' }
                    }
                }
            ]);
            const totalVolume = volumeAgg.length > 0 ? volumeAgg[0].total_volume : 0;

            results.push({
                name: collectionName,
                description: '',
                creator_address: topNft?.creator_address || '',
                image_url: imageUrl,
                floor_price: floorPrice,
                total_volume: totalVolume,
                total_items: totalItems,
                total_likes: totalLikes,
                owners_count: ownersCount,
            });
        }

        res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('[ERROR] getCollectionsByLikes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
