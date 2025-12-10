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

// Get all open loans (Status = Requested)
export const getOpenLoans = async (req, res) => {
  try {
    const loans = await Loan.find({ status: 'Requested' }).sort({ createdAt: -1 });
    
    // Optionally fetch NFT details for each loan to display images
    // This assumes the NFT is in our local DB. If it's external, we might need to fetch metadata differently.
    // For now, we'll return the loan data and let the frontend fetch NFT details if needed, 
    // or we can do a quick lookup if the NFT exists in our local DB.
    
    const loansWithNftData = await Promise.all(loans.map(async (loan) => {
      const nft = await NFT.findOne({ token_id: loan.tokenId }); // Simple check by token_id, ideally should check contract too
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
    if (status === 'Liquidated') {
        try {
            // Find NFT by token ID (assuming local NFT for now, or matching ID)
            // In a multi-collection system, we should also check the contract address
            // But based on the NFT model, token_id is unique.
            const nft = await NFT.findOne({ token_id: loan.tokenId });
            
            if (nft) {
                // Verify if it's the correct collection if possible, or just update
                // For local NFTs, contract address usually matches config
                
                // Update owner
                nft.owner_address = loan.lender;
                nft.is_listed = false; // Ensure it's not listed anymore
                nft.price = null; // Reset price
                await nft.save();
                console.log(`[Loan] NFT ${nft.token_id} ownership transferred to lender ${loan.lender} due to liquidation`);
            }
        } catch (nftError) {
            console.error('[Loan] Failed to update NFT owner on liquidation:', nftError);
            // Don't fail the request, just log it
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
