import Transaction from '../models/transaction.js';

// Record a new transaction
export const registerTransaction = async (req, res) => {
    try {
        const { transaction_hash, nft_id, from_address, to_address, transaction_type, price, block_number, gas_used, gas_price } = req.body;

        const transaction = new Transaction({
            transaction_hash,
            nft: nft_id,
            from_address,
            to_address,
            transaction_type,
            price,
            block_number,
            gas_used,
            gas_price,
            timestamp: new Date()
        });

        await transaction.save();
        res.status(201).json({ success: true, transaction });
    } catch (error) {
        console.error("[ERROR] registerTransaction:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update a transaction
export const updateTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const updates = req.body;

        const transaction = await Transaction.findByIdAndUpdate(transactionId, updates, { new: true });
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        res.json({ success: true, transaction });
    } catch (error) {
        console.error("[ERROR] updateTransaction:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get transaction by ID
export const getTransactionById = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const transaction = await Transaction.findById(transactionId).populate('nft');
        
        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        res.json({ success: true, transaction });
    } catch (error) {
        console.error("[ERROR] getTransactionById:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get all transactions with optional filtering
export const getAllTransactions = async (req, res) => {
    try {
        const { type, page = 1, limit = 10 } = req.query;
        const query = {};

        if (type) {
            query.transaction_type = type;
        }

        const transactions = await Transaction.find(query)
            .populate('nft')
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ timestamp: -1 });

        const total = await Transaction.countDocuments(query);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                page: Number(page),
                total_pages: Math.ceil(total / limit),
                total_items: total,
                has_next: (page * limit) < total,
                has_previous: page > 1
            }
        });
    } catch (error) {
        console.error("[ERROR] getAllTransactions:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
