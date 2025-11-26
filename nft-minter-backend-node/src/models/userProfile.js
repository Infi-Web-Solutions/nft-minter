import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema({
    wallet_address: { type: String, required: true, unique: true },
    username: { type: String },
    avatar_url: { type: String, default: '' },
    banner_url: { type: String, default: '' },
    bio: { type: String },
    website: { type: String },
    twitter: { type: String },
    instagram: { type: String },
    discord: { type: String },
    total_created: { type: Number, default: 0 },
    total_collected: { type: Number, default: 0 },
    total_volume: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UserProfile' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UserProfile' }]
});

const UserProfile = mongoose.model('UserProfile', userProfileSchema);
export default UserProfile;
