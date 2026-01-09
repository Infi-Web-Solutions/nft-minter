import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema({
  listingId: { type: Number, required: true, unique: true },
  nftAddress: { type: String, required: true },
  tokenId: { type: String, required: true },
  owner: { type: String, required: true },
  pricePerSecond: { type: String, required: true },
  minDuration: { type: Number, required: true },
  maxDuration: { type: Number, required: true },
  status: { type: String, enum: ['Active', 'Cancelled', 'Rented'], default: 'Active' },
  createdAt: { type: Date, default: Date.now },
  rentedBy: { type: String },
  rentalExpiresAt: { type: Date }
});

listingSchema.index({ nftAddress: 1, tokenId: 1 });

const Listing = mongoose.model('Listing', listingSchema);
export default Listing;
