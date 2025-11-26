import mongoose from 'mongoose';

const nftViewSchema = new mongoose.Schema({
    nft: { type: mongoose.Schema.Types.ObjectId, ref: 'NFT', required: true },
    viewer_address: { type: String },
    ip_address: { type: String },
    user_agent: { type: String },
    viewed_at: { type: Date, default: Date.now }
});

nftViewSchema.index({ nft: 1, viewer_address: 1, ip_address: 1 }, { unique: true });

const NFTView = mongoose.model('NFTView', nftViewSchema);
export default NFTView;
