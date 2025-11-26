import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
    user_address: { type: String, required: true },
    nft: { type: mongoose.Schema.Types.ObjectId, ref: 'NFT', required: true },
    created_at: { type: Date, default: Date.now }
});

favoriteSchema.index({ user_address: 1, nft: 1 }, { unique: true });

const Favorite = mongoose.model('Favorite', favoriteSchema);
export default Favorite;
