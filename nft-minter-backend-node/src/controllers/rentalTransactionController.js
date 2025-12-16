import RentalTransaction from '../models/rentalTransaction.js';
import { ethers } from 'ethers';

/**
 * Get all rental transactions (with pagination)
 */
export const getAllTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        const transactions = await RentalTransaction.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await RentalTransaction.countDocuments();
        
        // Format transactions for display
        const formatted = transactions.map(tx => formatTransaction(tx));
        
        return res.json({ 
            success: true, 
            data: formatted,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[RentalTransactionController] Error fetching transactions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get transactions for a specific NFT
 */
export const getTransactionsByNFT = async (req, res) => {
    const { nftAddress, tokenId } = req.params;
    
    try {
        const transactions = await RentalTransaction.find({
            nftAddress: { $regex: new RegExp(`^${nftAddress}$`, 'i') },
            tokenId: tokenId.toString()
        }).sort({ createdAt: -1 });
        
        const formatted = transactions.map(tx => formatTransaction(tx));
        
        return res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('[RentalTransactionController] Error fetching NFT transactions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get transactions for a specific user (as owner or renter)
 */
export const getTransactionsByUser = async (req, res) => {
    const { userAddress } = req.params;
    
    try {
        const transactions = await RentalTransaction.find({
            $or: [
                { owner: { $regex: new RegExp(`^${userAddress}$`, 'i') } },
                { renter: { $regex: new RegExp(`^${userAddress}$`, 'i') } }
            ]
        }).sort({ createdAt: -1 });
        
        const formatted = transactions.map(tx => formatTransaction(tx));
        
        return res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('[RentalTransactionController] Error fetching user transactions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get transactions by listing ID
 */
export const getTransactionsByListing = async (req, res) => {
    const { listingId } = req.params;
    
    try {
        const transactions = await RentalTransaction.find({
            listingId: parseInt(listingId)
        }).sort({ createdAt: -1 });
        
        const formatted = transactions.map(tx => formatTransaction(tx));
        
        return res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('[RentalTransactionController] Error fetching listing transactions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get transaction summary statistics
 */
export const getTransactionStats = async (req, res) => {
    try {
        const stats = await RentalTransaction.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalValue: { $sum: { $toDouble: { $ifNull: ['$rentAmount', '0'] } } }
                }
            }
        ]);
        
        const totalListings = await RentalTransaction.countDocuments({ type: 'Listed' });
        const totalRentals = await RentalTransaction.countDocuments({ type: 'Rented' });
        const totalCancelled = await RentalTransaction.countDocuments({ type: 'Cancelled' });
        
        return res.json({ 
            success: true, 
            data: {
                stats,
                totalListings,
                totalRentals,
                totalCancelled
            }
        });
    } catch (error) {
        console.error('[RentalTransactionController] Error fetching stats:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Helper function to format transaction for display
 */
function formatTransaction(tx) {
    const formatted = {
        id: tx._id,
        type: tx.type,
        listingId: tx.listingId,
        nftAddress: tx.nftAddress,
        tokenId: tx.tokenId,
        owner: tx.owner,
        renter: tx.renter,
        transactionHash: tx.transactionHash,
        blockNumber: tx.blockNumber,
        createdAt: tx.createdAt,
        // Formatted values
        ownerShort: tx.owner ? `${tx.owner.slice(0, 6)}...${tx.owner.slice(-4)}` : null,
        renterShort: tx.renter ? `${tx.renter.slice(0, 6)}...${tx.renter.slice(-4)}` : null,
    };
    
    // Format ETH amounts
    if (tx.rentAmount && tx.rentAmount !== '0') {
        try {
            formatted.rentAmountETH = ethers.formatEther(tx.rentAmount);
        } catch {
            formatted.rentAmountETH = tx.rentAmount;
        }
    }
    
    if (tx.depositAmount && tx.depositAmount !== '0') {
        try {
            formatted.depositAmountETH = ethers.formatEther(tx.depositAmount);
        } catch {
            formatted.depositAmountETH = tx.depositAmount;
        }
    }
    
    if (tx.pricePerSecond && tx.pricePerSecond !== '0') {
        try {
            const pricePerSecondBN = BigInt(tx.pricePerSecond);
            formatted.pricePerDayETH = ethers.formatEther(pricePerSecondBN * 86400n);
        } catch {
            formatted.pricePerDayETH = tx.pricePerSecond;
        }
    }
    
    // Duration info
    if (tx.minDuration) {
        formatted.minDays = Math.ceil(tx.minDuration / 86400);
    }
    if (tx.maxDuration) {
        formatted.maxDays = Math.ceil(tx.maxDuration / 86400);
    }
    if (tx.expiresAt) {
        formatted.expiresAt = tx.expiresAt;
    }
    if (tx.wrappedTokenId) {
        formatted.wrappedTokenId = tx.wrappedTokenId;
    }
    
    return formatted;
}
