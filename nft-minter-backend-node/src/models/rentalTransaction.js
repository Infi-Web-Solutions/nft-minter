import mongoose from 'mongoose';

const rentalTransactionSchema = new mongoose.Schema({
  // Transaction type
  type: { 
    type: String, 
    enum: ['Listed', 'Rented', 'Cancelled', 'DepositRefunded', 'Withdrawn'], 
    required: true 
  },
  
  // Listing info
  listingId: { type: Number, required: true, index: true },
  nftAddress: { type: String, required: true },
  tokenId: { type: String, required: true },
  
  // Users involved
  owner: { type: String },       // NFT owner who listed
  renter: { type: String },      // User who rented
  
  // Financial details
  pricePerSecond: { type: String },
  rentAmount: { type: String },
  depositAmount: { type: String },
  
  // Duration info
  minDuration: { type: Number },
  maxDuration: { type: Number },
  rentDuration: { type: Number },  // Actual rent duration in seconds
  expiresAt: { type: Date },
  
  // Wrapped NFT info
  wrappedTokenId: { type: Number },
  
  // Blockchain details
  transactionHash: { type: String },
  blockNumber: { type: Number },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now }
});

// Indexes for efficient queries
rentalTransactionSchema.index({ nftAddress: 1, tokenId: 1 });
rentalTransactionSchema.index({ owner: 1 });
rentalTransactionSchema.index({ renter: 1 });
rentalTransactionSchema.index({ createdAt: -1 });

const RentalTransaction = mongoose.model('RentalTransaction', rentalTransactionSchema);
export default RentalTransaction;
