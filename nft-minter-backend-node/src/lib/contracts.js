import { ethers } from "ethers";

import FeeManagerABI from "../abi/FeeManager.abi.js";
import WrappedABI from "../abi/Wrapped.abi.js";
import LeasingABI from "../abi/Leasing.abi.js";

export const provider = new ethers.JsonRpcProvider(process.env.sepoliaUrl);
provider.pollingInterval = 12000; // Increase polling interval to reduce RPC load and filter issues

export const adminWallet = new ethers.Wallet(
  process.env.ADMIN_PRIVATE_KEY,
  provider
);

// FeeManager (ADMIN ONLY)
export const feeManager = new ethers.Contract(
  process.env.FeeManager_Address,
  FeeManagerABI,
  adminWallet
);

// Wrapped (read-only)
export const wrappedLeasing = new ethers.Contract(
  process.env.WrappedLeasing_Address,
  WrappedABI,
  provider
);

// Leasing (ADMIN if needed)
export const leasingMarketplace = new ethers.Contract(
  process.env.LeasingMarketplace_Address,
  LeasingABI,
  adminWallet

);
