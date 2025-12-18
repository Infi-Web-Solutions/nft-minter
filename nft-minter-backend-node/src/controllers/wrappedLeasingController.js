

import pkg from 'express';
const { Request, Response } = pkg;
import { wrappedLeasingService } from '../services/WrappedLeasingService.js';
import WrappedNft from '../models/wrappedNft.js';

/**
 * Validate NFT ownership and approval status
 */
export const validateNFT = async (req, res) => {
  const { nftContract, tokenId, ownerAddress } = req.query;

  if (!nftContract || !tokenId || !ownerAddress) {
    return res.status(400).json({ error: 'Missing required parameters: nftContract, tokenId, ownerAddress' });
  }

  try {
    const validation = await wrappedLeasingService.validateNFTApproval(nftContract, tokenId, ownerAddress);
    return res.json(validation);
  } catch (error) {
    console.error('Validate NFT error:', error.message || error);
    return res.status(400).json({ error: error.message || 'Failed to validate NFT' });
  }
};

/**
 * Calculate wrapping fee
 */
export const calculateWrappingFee = async (req, res) => {
  const { durationDays } = req.body;

  if (!durationDays) {
    return res.status(400).json({ error: 'Missing required parameter: durationDays' });
  }

  try {
    const feeInfo = await wrappedLeasingService.calculateWrappingFee(parseFloat(durationDays));
    return res.json(feeInfo);
  } catch (error) {
    console.error('Calculate fee error:', error.message || error);
    return res.status(400).json({ error: error.message || 'Failed to calculate fee' });
  }
};

/**
 * Validate wrapping parameters
 */
export const validateWrappingParams = async (req, res) => {
  const { nftContract, tokenId, renterAddress, durationDays } = req.body;

  if (!nftContract || !tokenId || !renterAddress || !durationDays) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const validation = await wrappedLeasingService.validateWrappingParams(nftContract, tokenId, renterAddress, parseFloat(durationDays));
    return res.json(validation);
  } catch (error) {
    console.error('Validate wrapping params error:', error.message || error);
    return res.status(400).json({ error: error.message || 'Failed to validate parameters' });
  }
};

/**
 * Check if user can unwrap NFT
 */
export const canUnwrapNFT = async (req, res) => {
  const { wId, userAddress } = req.query;

  if (!wId || !userAddress) {
    return res.status(400).json({ error: 'Missing required parameters: wId, userAddress' });
  }

  try {
    const canUnwrapInfo = await wrappedLeasingService.canUnwrapNFT(wId, userAddress);
    return res.json(canUnwrapInfo);
  } catch (error) {
    console.error('Check unwrap permission error:', error.message || error);
    return res.status(400).json({ error: error.message || 'Failed to check unwrap permission' });
  }
};

/**
 * Get contract information for frontend
 */
export const getContractInfo = async (_req, res) => {
  try {
    const contractInfo = wrappedLeasingService.getContractInfo();
    return res.json(contractInfo);
  } catch (error) {
    console.error('Get contract info error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to get contract info' });
  }
};

/**
 * Get Wrapped NFT Info
 */
export const getWrappedInfo = async (req, res) => {
  const { wId } = req.params;
  try {
    const info = await wrappedLeasingService.getWrappedInfo(wId);
    return res.json(info);
  } catch (error) {
    console.error('Get Wrapped Info error:', error.message || error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Get Lease Status
 */
export const getLeaseStatus = async (req, res) => {
  const { wId } = req.params;
  try {
    const status = await wrappedLeasingService.getLeaseStatus(wId);
    return res.json(status);
  } catch (error) {
    console.error('Get Lease Status error:', error.message || error);
    return res.status(500).json({ error: error.message });
  }
};


/**
 * Set FeeManager (Admin only)
 * Note: The blockchain will enforce admin permissions. This endpoint allows the backend 
 * wallet to attempt set the FeeManager. If the wallet doesn't have admin role, 
 * the transaction will fail with a more descriptive blockchain error.
 */
export const setFeeManager = async (req, res) => {
  const { feeManagerAddress } = req.body;
  if (!feeManagerAddress) return res.status(400).json({ error: 'FeeManager address required' });

  try {
    console.log(`[SetFeeManager] Attempting to set FeeManager to ${feeManagerAddress}`);
    const result = await wrappedLeasingService.setFeeManager(feeManagerAddress);
    console.log('[SetFeeManager] Success:', result);
    return res.json(result);
  } catch (error) {
    console.error('Set FeeManager error:', error.message || error);
    
    // Provide more helpful error message based on error type
    let errorMessage = error.message || 'Failed to set FeeManager';
    
    if (errorMessage.includes('AccessControl') || errorMessage.includes('onlyRole') || errorMessage.includes('missing role')) {
      errorMessage = 'Backend wallet does not have ADMIN_ROLE on WrappedLeasing contract. Please run the set-fee-manager-on-wrapped.js script from the deployer account.';
    }
    
    return res.status(500).json({ error: errorMessage });
  }
};

/**
 * Check if FeeManager is configured
 */
export const isFeeManagerConfigured = async (_req, res) => {
  try {
    const configured = await wrappedLeasingService.isFeeManagerConfigured();
    return res.json({ configured });
  } catch (error) {
    console.error('Check FeeManager error:', error.message || error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Unwrap NFT
 */
export const unwrapNFT = async (req, res) => {
  const { wId } = req.params;

  if (!wId) {
    return res.status(400).json({ error: 'Wrapped NFT ID (wId) is required' });
  }

  try {
    const result = await wrappedLeasingService.unwrapNFT(wId);
    return res.json(result);
  } catch (error) {
    console.error('Unwrap NFT error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to unwrap NFT' });
  }
};

/**
 * Get wrapped counter
 */
export const getWCounter = async (_req, res) => {
  try {
    const counter = await wrappedLeasingService.getWCounter();
    return res.json({ counter });
  } catch (error) {
    console.error('Get wrapped counter error:', error.message || error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Validate environment
 */
export const validateEnvironment = async (_req, res) => {
  try {
    wrappedLeasingService.validateEnvironment();
    return res.json({ valid: true, message: 'Environment variables are valid' });
  } catch (error) {
    console.error('Environment validation error:', error.message || error);
    return res.status(400).json({ valid: false, error: error.message });
  }
};

/**
 * Save wrapped NFT to database
 */
export const saveWrappedNFT = async (req, res) => {
  const { wId, originalNftContract, originalTokenId, owner, renter, validUntil, durationSeconds, feePaid, transactionHash, metadataURI } = req.body;

  if (!wId || !originalNftContract || !originalTokenId || !owner || !renter) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const wrappedNft = new WrappedNft({
      wId: parseInt(wId),
      originalNftContract,
      originalTokenId,
      owner,
      renter,
      validUntil: new Date(validUntil * 1000), // Convert from Unix timestamp
      durationSeconds,
      feePaid: feePaid || '0',
      transactionHash,
      status: 'Active',
      metadataURI: metadataURI || ''
    });

    await wrappedNft.save();
    console.log(`[WrappedNFT] Saved wrapped NFT #${wId} to database`);
    
    return res.json({ success: true, data: wrappedNft });
  } catch (error) {
    // Handle duplicate key error (already saved)
    if (error.code === 11000) {
      console.log(`[WrappedNFT] Wrapped NFT #${wId} already exists in database`);
      return res.json({ success: true, message: 'Already saved' });
    }
    console.error('Save wrapped NFT error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to save wrapped NFT' });
  }
};

/**
 * Update wrapped NFT status
 */
export const updateWrappedNFTStatus = async (req, res) => {
  const { wId } = req.params;
  const { status } = req.body;

  if (!wId || !status) {
    return res.status(400).json({ error: 'wId and status are required' });
  }

  if (!['Active', 'Expired', 'Unwrapped'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be Active, Expired, or Unwrapped' });
  }

  try {
    const result = await WrappedNft.findOneAndUpdate(
      { wId: parseInt(wId) },
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: 'Wrapped NFT not found' });
    }

    console.log(`[WrappedNFT] Updated wrapped NFT #${wId} status to ${status}`);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Update wrapped NFT status error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to update status' });
  }
};

/**
 * Get user's wrapped NFTs from database
 */
export const getUserWrappedNFTs = async (req, res) => {
  const { userAddress } = req.params;

  if (!userAddress) {
    return res.status(400).json({ error: 'User address is required' });
  }

  try {
    // Update expired statuses first
    await WrappedNft.updateExpiredStatuses();

    // Find NFTs where user is owner or renter
    const wrappedNfts = await WrappedNft.find({
      $or: [
        { owner: { $regex: new RegExp(`^${userAddress}$`, 'i') } },
        { renter: { $regex: new RegExp(`^${userAddress}$`, 'i') } }
      ]
    }).sort({ createdAt: -1 });

    return res.json({ success: true, data: wrappedNfts });
  } catch (error) {
    console.error('Get user wrapped NFTs error:', error.message || error);
    return res.status(500).json({ error: error.message || 'Failed to get wrapped NFTs' });
  }
};

/**
 * Get detailed info for a single wrapped NFT (DB + rental details)
 */
export const getWrappedDetails = async (req, res) => {
  const { wId } = req.params;

  if (!wId) {
    return res.status(400).json({ error: 'Wrapped NFT ID (wId) is required' });
  }

  try {
    const numericWId = parseInt(wId);

    // Base wrapped NFT record from database
    const wrapped = await WrappedNft.findOne({ wId: numericWId });
    if (!wrapped) {
      return res.status(404).json({ error: 'Wrapped NFT not found in database' });
    }

    // Try to fetch latest rental transaction linked to this wNFT
    let rental = null;
    try {
      const rentalTxModule = await import('../models/rentalTransaction.js');
      const RentalTransaction = rentalTxModule.default;
      rental = await RentalTransaction.findOne({ wrappedTokenId: numericWId })
        .sort({ createdAt: -1 })
        .lean();
    } catch (txError) {
      console.warn('[WrappedNFT] Failed to load rental transaction for wId', wId, txError);
    }

    return res.json({
      success: true,
      data: {
        wrapped,
        rental,
      },
    });
  } catch (error) {
    console.error('Get wrapped details error:', error.message || error);
    return res
      .status(500)
      .json({ error: error.message || 'Failed to get wrapped NFT details' });
  }
};