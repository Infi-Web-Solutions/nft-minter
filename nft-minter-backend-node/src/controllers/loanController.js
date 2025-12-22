import Loan from '../models/loan.js';
import NFT from '../models/nft.js';

// Create a new loan record (called after blockchain transaction)
export const createLoan = async (req, res) => {
  try {
    const {
      loanId,
      nftContract,
      tokenId,
      borrower,
      principal,
      interestBps,
      duration,
      transactionHash
    } = req.body;

    // Check if loan already exists
    const existingLoan = await Loan.findOne({ loanId });
    if (existingLoan) {
      return res.status(400).json({ success: false, error: 'Loan ID already exists' });
    }

    const newLoan = new Loan({
      loanId,
      nftContract,
      tokenId,
      borrower,
      principal,
      interestBps,
      duration,
      transactionHash,
      status: 'Requested'
    });

    await newLoan.save();
    res.status(201).json({ success: true, data: newLoan });
  } catch (error) {
    console.error('Error creating loan record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all active loans (Status = Requested or Funded)
// This includes both loans waiting for lenders and loans that are currently active
export const getOpenLoans = async (req, res) => {
  try {
    const loans = await Loan.find({
      status: { $in: ['Requested', 'Funded'] }
    }).sort({ createdAt: -1 });

    // Optionally fetch NFT details for each loan to display images
    // This assumes the NFT is in our local DB. If it's external, we might need to fetch metadata differently.
    // For now, we'll return the loan data and let the frontend fetch NFT details if needed, 
    // or we can do a quick lookup if the NFT exists in our local DB.

    const loansWithNftData = await Promise.all(loans.map(async (loan) => {
      // Try to find by contract and token ID first (more accurate)
      let nft = await NFT.findOne({
        token_id: loan.tokenId,
        contract_address: loan.nftContract ? loan.nftContract.toLowerCase() : null
      });

      // Fallback to just token_id if not found (for legacy data or missing contract addr)
      if (!nft) {
        nft = await NFT.findOne({ token_id: loan.tokenId });
      }

      return {
        ...loan.toObject(),
        nftData: nft ? { name: nft.name, image_url: nft.image_url } : null
      };
    }));

    res.json({ success: true, data: loansWithNftData });
  } catch (error) {
    console.error('Error fetching open loans:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update loan status (Funded, Repaid, Liquidated, Cancelled)
export const updateLoanStatus = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { status, lender, startTime } = req.body;

    const loan = await Loan.findOne({ loanId });
    if (!loan) {
      return res.status(404).json({ success: false, error: 'Loan not found' });
    }

    if (status) loan.status = status;
    if (lender) loan.lender = lender;
    if (startTime) loan.startTime = startTime;

    await loan.save();

    // If Liquidated, update the NFT owner to the lender
    if (status === 'Liquidated' && loan.lender) {
      try {
        // Try to find NFT by contract address AND token ID for external NFTs
        // For local NFTs, we can match by token_id alone as they're unique
        let nft = await NFT.findOne({
          contract_address: loan.nftContract,
          token_id: loan.tokenId
        });

        // If not found by contract, try by token_id alone (for older local NFTs)
        if (!nft) {
          nft = await NFT.findOne({ token_id: loan.tokenId });
        }

        if (nft) {
          console.log(`[Loan] Updating NFT ownership for liquidation - Loan #${loan.loanId}`);
          console.log(`[Loan] Previous owner: ${nft.owner_address}`);
          console.log(`[Loan] New owner (lender): ${loan.lender}`);
          console.log(`[Loan] Original NFT price: ${nft.price} ETH (will be preserved)`);

          // Update owner - KEEP the original price so lender can sell it to recover investment!
          nft.owner_address = loan.lender.toLowerCase();
          nft.is_listed = false; // Set to false - new owner (lender) should decide if they want to list it
          // ✅ DO NOT reset price - lender can sell at original price to recover their loss
          await nft.save();

          console.log(`[Loan] ✅ NFT ${nft.token_id} ownership transferred to lender ${loan.lender} due to liquidation`);
          console.log(`[Loan] ✅ NFT price preserved (${nft.price} ETH) - lender can list to recover investment`);
        } else {
          console.log(`[Loan] ⚠️ NFT not found in database (Contract: ${loan.nftContract}, Token: ${loan.tokenId})`);
          console.log(`[Loan] This is expected for external NFTs not minted through the platform`);
          console.log(`[Loan] Liquidation successful on blockchain - lender now owns NFT on-chain`);
        }
      } catch (nftError) {
        console.error('[Loan] Failed to update NFT owner on liquidation:', nftError);
        // Don't fail the request, just log it - blockchain transfer already happened
      }
    }

    res.json({ success: true, data: loan });
  } catch (error) {
    console.error('Error updating loan status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get loans by user (borrower or lender)
export const getUserLoans = async (req, res) => {
  try {
    const { address } = req.params;
    const loans = await Loan.find({
      $or: [
        { borrower: address.toLowerCase() },
        { lender: address.toLowerCase() }
      ]
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: loans });
  } catch (error) {
    console.error('Error fetching user loans:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
