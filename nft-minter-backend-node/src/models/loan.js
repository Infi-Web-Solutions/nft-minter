import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
  loanId: {
    type: Number,
    required: true,
    unique: true
  },
  nftContract: {
    type: String,
    required: true
  },
  tokenId: {
    type: String,
    required: true
  },
  borrower: {
    type: String,
    required: true,
    lowercase: true
  },
  lender: {
    type: String,
    lowercase: true,
    default: null
  },
  principal: {
    type: String, // Stored as string to handle large numbers/decimals safely
    required: true
  },
  interestBps: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // in seconds
    required: true
  },
  status: {
    type: String,
    enum: ['Requested', 'Funded', 'Repaid', 'Liquidated', 'Cancelled'],
    default: 'Requested'
  },
  startTime: {
    type: Number,
    default: 0
  },
  transactionHash: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for faster lookups
loanSchema.index({ status: 1, createdAt: -1 });

const Loan = mongoose.model('Loan', loanSchema);

export default Loan;
