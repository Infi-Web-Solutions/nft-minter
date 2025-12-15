import { ethers } from "ethers";

import FeeManagerABI from "../abi/FeeManager.abi.js";
import WrappedABI from "../abi/Wrapped.abi.js";
import LeasingABI from "../abi/Leasing.abi.js";

export const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

export const adminWallet = new ethers.Wallet(
  process.env.ADMIN_PRIVATE_KEY,
  provider
);

// FeeManager (ADMIN ONLY)
export const feeManager = new ethers.Contract(
  process.env.FEE_MANAGER_ADDRESS,
  FeeManagerABI,
  adminWallet
);

// Wrapped (read-only)
export const wrappedLeasing = new ethers.Contract(
  process.env.WRAPPED_LEASING_ADDRESS,
  WrappedABI,
  provider
);

// Leasing (ADMIN if needed)
export const leasingMarketplace = new ethers.Contract(
  process.env.LEASING_MARKETPLACE_ADDRESS,
  LeasingABI,
  adminWallet
);
