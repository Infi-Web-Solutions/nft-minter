import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    avatarUrl: {
        type: String,
        default: null
    },
    bannerUrl: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        default: null
    },
    website: {
        type: String,
        default: null
    },
    twitter: {
        type: String,
        default: null
    },
    instagram: {
        type: String,
        default: null
    },
    discord: {
        type: String,
        default: null
    },
    totalCreated: {
        type: Number,
        default: 0
    },
    totalCollected: {
        type: Number,
        default: 0
    },
    totalVolume: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);

export default User;