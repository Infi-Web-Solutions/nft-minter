import mongoose from 'mongoose';

const wrappedNftSchema = new mongoose.Schema({
    wId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    originalNftContract: {
        type: String,
        required: true,
        index: true
    },
    originalTokenId: {
        type: String,
        required: true
    },
    owner: {
        type: String,
        required: true,
        index: true
    },
    renter: {
        type: String,
        required: true,
        index: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    durationSeconds: {
        type: Number,
        required: true
    },
    feePaid: {
        type: String, // Store as string for big number precision
        default: '0'
    },
    transactionHash: {
        type: String
    },
    status: {
        type: String,
        enum: ['Active', 'Expired', 'Unwrapped'],
        default: 'Active'
    },
    metadataURI: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true 
});

// Compound index for looking up by original NFT
wrappedNftSchema.index({ originalNftContract: 1, originalTokenId: 1 });

// Static method to update status based on validUntil
wrappedNftSchema.statics.updateExpiredStatuses = async function() {
    const now = new Date();
    const result = await this.updateMany(
        { 
            status: 'Active',
            validUntil: { $lt: now }
        },
        { 
            status: 'Expired',
            updatedAt: now
        }
    );
    return result.modifiedCount;
};

const WrappedNft = mongoose.model('WrappedNft', wrappedNftSchema);

export default WrappedNft;
