import "dotenv/config";
import { feeManager, adminWallet } from "../lib/contracts.js";

async function checkFeeManager() {
  console.log("Admin wallet:", adminWallet.address);

  const marketplaceFee = await feeManager.marketplaceFeeBps();
  const leasingApr = await feeManager.lendingAprBps();

  const role = await feeManager.DEFAULT_ADMIN_ROLE();
  const hasRole = await feeManager.hasRole(role, adminWallet.address);

  console.log("Marketplace Fee (bps):", marketplaceFee.toString());
  console.log("Leasing APR (bps):", leasingApr.toString());
  console.log("Admin has role:", hasRole);
}

checkFeeManager()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ FeeManager check failed:", err);
    process.exit(1);
  });
