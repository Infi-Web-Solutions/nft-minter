import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    transaction_hash: { type: String, unique: true, required: true },
    nft: { type: mongoose.Schema.Types.ObjectId, ref: 'NFT', default: null },
    from_address: { type: String, required: true },
    to_address: { type: String, required: true },
    transaction_type: { type: String, enum: ['mint', 'list', 'buy', 'bid', 'transfer', 'delist', 'follow', 'unfollow', 'like', 'unlike'], required: true },
    price: { type: Number },
    block_number: { type: Number, default: 0 },
    gas_used: { type: Number, default: 0 },
    gas_price: { type: Number, default: 0 },
    timestamp: { type: Date, required: true },
    created_at: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;