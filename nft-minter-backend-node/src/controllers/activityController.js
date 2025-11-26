import Transaction from '../models/transaction.js';
import Favorite from '../models/favorite.js';
import NFT from '../models/nft.js';

// Get all activities with filtering and pagination
export const getActivities = async (req, res) => {
    try {
        const { page = 1, limit = 20, type, time_filter, search, user } = req.query;
        
        // Build filter object
        const filter = {};

        if (type && type !== 'all') {
            filter.transaction_type = type;
        } else {
            // For 'all' activities, exclude 'like' and 'unlike' types
            filter.transaction_type = { $nin: ['like', 'unlike'] };
        }
        
        if (user) {
            filter.$or = [
                { from_address: user.toLowerCase() },
                { to_address: user.toLowerCase() }
            ];
        }
        
        if (search) {
            // Search in NFT name or addresses
            filter.$or = [
                ...(filter.$or || []),
                { 'nft_data.name': { $regex: search, $options: 'i' } },
                { from_address: { $regex: search, $options: 'i' } },
                { to_address: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Time filter
        if (time_filter) {
            const now = new Date();
            let timeStart;
            
            switch (time_filter) {
                case '1h':
                    timeStart = new Date(now - 60 * 60 * 1000);
                    break;
                case '24h':
                    timeStart = new Date(now - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    timeStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    timeStart = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    break;
            }
            
            if (timeStart) {
                filter.timestamp = { $gte: timeStart };
            }
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const activities = await Transaction.find(filter)
            .populate('nft')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Filter out activities with unknown NFTs (where nft is null or undefined)
        const validActivities = activities.filter(activity => activity.nft != null);

        const total_items = await Transaction.countDocuments(filter);
        const total_pages = Math.ceil(total_items / parseInt(limit));

        // Transform activities to match frontend format
        const transformedActivities = validActivities.map(activity => ({
            id: activity._id,
            type: activity.transaction_type,
            nft: {
                id: activity.nft?.token_id || 0,
                name: activity.nft?.name || `NFT #${activity.nft?.token_id || 'Unknown'}`,
                image_url: activity.nft?.image_url || '',
                collection: activity.nft?.nft_collection || 'Unknown Collection',
                token_id: activity.nft?.token_id || 0
            },
            from: {
                address: activity.from_address,
                name: activity.from_address.slice(0, 6) + '...' + activity.from_address.slice(-4),
                avatar: ''
            },
            to: {
                address: activity.to_address,
                name: activity.to_address.slice(0, 6) + '...' + activity.to_address.slice(-4),
                avatar: ''
            },
            price: activity.price || null,
            timestamp: activity.timestamp,
            time_ago: getTimeAgo(activity.timestamp),
            transaction_hash: activity.transaction_hash,
            block_number: activity.block_number || 0,
            gas_used: activity.gas_used || 0,
            gas_price: activity.gas_price || null
        }));
        
        res.status(200).json({
            success: true,
            data: transformedActivities,
            pagination: {
                page: parseInt(page),
                total_pages,
                total_items,
                has_next: parseInt(page) < total_pages,
                has_previous: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('[ERROR] getActivities:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get activity statistics
export const getActivityStats = async (req, res) => {
    try {
        const now = new Date();
        const yesterday = new Date(now - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        
        // Get counts for different time periods
        const last_24h = await getStatsForPeriod(yesterday);
        const last_7d = await getStatsForPeriod(weekAgo);
        const last_30d = await getStatsForPeriod(monthAgo);
        
        res.status(200).json({
            success: true,
            data: {
                last_24h,
                last_7d,
                last_30d
            }
        });
    } catch (error) {
        console.error('[ERROR] getActivityStats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper function to get stats for a time period
async function getStatsForPeriod(since) {
    const filter = { timestamp: { $gte: since } };
    
    const total = await Transaction.countDocuments(filter);
    const sales = await Transaction.countDocuments({ ...filter, transaction_type: 'buy' });
    const listings = await Transaction.countDocuments({ ...filter, transaction_type: 'list' });
    const mints = await Transaction.countDocuments({ ...filter, transaction_type: 'mint' });
    const transfers = await Transaction.countDocuments({ ...filter, transaction_type: 'transfer' });
    const offers = await Transaction.countDocuments({ ...filter, transaction_type: 'bid' });
    
    return {
        total,
        sales,
        listings,
        mints,
        transfers,
        offers
    };
}

// Get notifications for a user
export const getNotifications = async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { page = 1, limit = 20 } = req.query;

        if (!walletAddress) {
            return res.status(400).json({ success: false, error: 'Wallet address required' });
        }

        const userAddress = walletAddress.toLowerCase();
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get transaction-based notifications
        const transactionFilter = {
            $or: [
                { from_address: userAddress },
                { to_address: userAddress }
            ]
        };

        const activities = await Transaction.find(transactionFilter)
            .populate('nft')
            .sort({ timestamp: -1 });

        // Get like-based notifications
        const likes = await Favorite.find({})
            .populate('nft')
            .sort({ created_at: -1 })
            .limit(100); // Get recent likes

        // Transform transaction notifications
        const transactionNotifications = activities.map(activity => {
            let title = '';
            let message = '';
            let icon = '';

            const fromName = activity.from_address.slice(0, 6) + '...' + activity.from_address.slice(-4);
            const toName = activity.to_address.slice(0, 6) + '...' + activity.to_address.slice(-4);
            const nftName = activity.nft ? activity.nft.name : 'NFT';

            if (activity.transaction_type === 'buy') {
                if (activity.to_address.toLowerCase() === userAddress) {
                    title = 'Sale completed';
                    message = `${nftName} sold for Ξ ${activity.price ?? 0}`;
                    icon = 'ShoppingBag';
                } else {
                    title = 'You bought an NFT';
                    message = `You bought ${nftName} for Ξ ${activity.price ?? 0}`;
                    icon = 'ShoppingBag';
                }
            } else if (activity.transaction_type === 'bid') {
                if (activity.to_address.toLowerCase() === userAddress) {
                    title = 'New offer on your NFT';
                    message = `${fromName} offered Ξ ${activity.price ?? 0} for ${nftName}`;
                    icon = 'Tag';
                } else {
                    title = 'You placed an offer';
                    message = `You offered Ξ ${activity.price ?? 0} for ${nftName}`;
                    icon = 'Tag';
                }
            } else if (activity.transaction_type === 'follow') {
                if (activity.to_address.toLowerCase() === userAddress) {
                    title = 'New follower';
                    message = `${fromName} started following you`;
                    icon = 'UserPlus';
                }
            } else if (activity.transaction_type === 'unfollow') {
                if (activity.to_address.toLowerCase() === userAddress) {
                    title = 'Unfollowed';
                    message = `${fromName} unfollowed you`;
                    icon = 'UserMinus';
                }
            }

            return {
                id: `tx_${activity._id}`,
                type: activity.transaction_type,
                title,
                message,
                time: getTimeAgo(activity.timestamp),
                read: false,
                icon,
                timestamp: activity.timestamp
            };
        }).filter(n => n.title);

        // Transform like notifications
        const likeNotifications = likes.map(like => {
            if (!like.nft || like.nft.owner_address.toLowerCase() !== userAddress) {
                return null;
            }

            const likerName = like.user_address.slice(0, 6) + '...' + like.user_address.slice(-4);
            const nftName = like.nft.name || 'NFT';

            return {
                id: `like_${like._id}`,
                type: 'like',
                title: 'NFT liked',
                message: `${likerName} liked your ${nftName}`,
                time: getTimeAgo(like.created_at),
                read: false,
                icon: 'Heart',
                timestamp: like.created_at
            };
        }).filter(n => n !== null);

        // Combine and sort all notifications
        const allNotifications = [...transactionNotifications, ...likeNotifications]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply pagination
        const total_items = allNotifications.length;
        const total_pages = Math.ceil(total_items / parseInt(limit));
        const paginatedNotifications = allNotifications.slice(skip, skip + parseInt(limit));

        res.status(200).json({
            success: true,
            data: paginatedNotifications,
            pagination: {
                page: parseInt(page),
                total_pages,
                total_items,
                has_next: parseInt(page) < total_pages,
                has_previous: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('[ERROR] getNotifications:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper function to format time ago
function getTimeAgo(timestamp) {
    const now = new Date();
    const diff = now - new Date(timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
}
