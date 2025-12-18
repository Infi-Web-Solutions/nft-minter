
import express from 'express';

import {
  validateNFT,
  calculateWrappingFee,
  validateWrappingParams,
  canUnwrapNFT,
  getContractInfo,
  getWrappedInfo,
  getLeaseStatus,
  isFeeManagerConfigured,
  getWCounter,
  validateEnvironment,
  setFeeManager,
  saveWrappedNFT,
  updateWrappedNFTStatus,
  getUserWrappedNFTs,
  getWrappedDetails
} from '../controllers/wrappedLeasingController.js';

const router = express.Router();

// Frontend integration endpoints (validation + metadata)
router.get('/validate-nft', validateNFT);
router.post('/calculate-fee', calculateWrappingFee);
router.post('/validate-wrapping-params', validateWrappingParams);
router.get('/can-unwrap/:wId', canUnwrapNFT);
router.get('/contract-info', getContractInfo);

// Read-only blockchain queries
router.get('/wrapped-info/:wId', getWrappedInfo);
router.get('/lease-status/:wId', getLeaseStatus);
router.get('/w-counter', getWCounter);

// Database operations
router.post('/save', saveWrappedNFT);
router.put('/status/:wId', updateWrappedNFTStatus);
router.get('/user/:userAddress', getUserWrappedNFTs);
router.get('/details/:wId', getWrappedDetails);

// System endpoints
router.get('/validate-environment', validateEnvironment);
router.get('/fee-manager-configured', isFeeManagerConfigured);

// Admin endpoints
router.post('/set-fee-manager', setFeeManager);

export default router;
