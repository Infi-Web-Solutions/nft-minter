import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    creator_address: { type: String, required: true },
    image_url: { type: String },
    banner_url: { type: String },
    floor_price: { type: Number },
    total_volume: { type: Number, default: 0 },
    total_items: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
});

const Collection = mongoose.model('Collection', collectionSchema);
export default Collection;