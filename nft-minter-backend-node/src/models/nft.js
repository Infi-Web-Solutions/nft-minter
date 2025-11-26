import mongoose from 'mongoose';

const nftSchema = new mongoose.Schema({
    token_id: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    description: { type: String },
    image_url: { type: String },
    token_uri: { type: String },
    owner_address: { type: String, required: true },
    creator_address: { type: String, required: true },
    price: { type: Number },
    is_listed: { type: Boolean, default: false },
    is_auction: { type: Boolean, default: false },
    auction_end_time: { type: Date },
    current_bid: { type: Number },
    highest_bidder: { type: String },
    royalty_percentage: { type: Number, default: 0 },
    nft_collection: { type: String },
    
    category: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

const NFT = mongoose.model('NFT', nftSchema);
export default NFT;