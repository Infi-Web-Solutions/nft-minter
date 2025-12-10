/* eslint-disable no-console */
// Deploy FeeManager (UUPS), WrappedLeasing (UUPS), LeasingMarketplace (UUPS)
// Usage:
//   npx hardhat run scripts/deployLease.js --network <network>

const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
  const signers = await ethers.getSigners();
  const adminSigner = signers[0];
  const treasuryFallback = signers[1] || signers[0];

  // Env-configurable params with safe fallbacks
  const ADMIN = process.env.ADMIN_ADDRESS || adminSigner.address;
  const TREASURY = process.env.TREASURY_ADDRESS || treasuryFallback.address;
  const MARKETPLACE_FEE_BPS = Number(process.env.MARKETPLACE_FEE_BPS || 250); // 2.5%
  const LENDING_APR_BPS = Number(process.env.LENDING_APR_BPS || 1000);        // 10%
  const LEASING_FEE_BPS = Number(process.env.LEASING_FEE_BPS || 300);         // 3%

  console.log("Deploying with:");
  console.log("  Admin:      ", ADMIN);
  console.log("  Treasury:   ", TREASURY);
  console.log("  Marketplace:", MARKETPLACE_FEE_BPS, "bps");
  console.log("  Lending APR:", LENDING_APR_BPS, "bps");
  console.log("  Leasing Fee:", LEASING_FEE_BPS, "bps");

  // FeeManager proxy
  const FeeManager = await ethers.getContractFactory("FeeManager");
  const feeManager = await upgrades.deployProxy(
    FeeManager,
    [ADMIN, MARKETPLACE_FEE_BPS, LENDING_APR_BPS, LEASING_FEE_BPS, TREASURY],
    { kind: "uups", initializer: "initialize" }
  );
  await feeManager.waitForDeployment();
  console.log("FeeManager proxy:       ", await feeManager.getAddress());
  console.log("FeeManager impl:        ", await upgrades.erc1967.getImplementationAddress(await feeManager.getAddress()));

  // WrappedLeasing proxy
  const WrappedLeasing = await ethers.getContractFactory("WrappedLeasing");
  const wrappedLeasing = await upgrades.deployProxy(
    WrappedLeasing,
    [ADMIN, await feeManager.getAddress()],
    { kind: "uups", initializer: "initialize" }
  );
  await wrappedLeasing.waitForDeployment();
  console.log("WrappedLeasing proxy:   ", await wrappedLeasing.getAddress());
  console.log("WrappedLeasing impl:    ", await upgrades.erc1967.getImplementationAddress(await wrappedLeasing.getAddress()));

  // LeasingMarketplace proxy
  const LeasingMarketplace = await ethers.getContractFactory("LeasingMarketplace");
  const leasingMarket = await upgrades.deployProxy(
    LeasingMarketplace,
    [ADMIN, await feeManager.getAddress(), await wrappedLeasing.getAddress()],
    { kind: "uups", initializer: "initialize" }
  );
  await leasingMarket.waitForDeployment();
  console.log("LeasingMarketplace proxy:", await leasingMarket.getAddress());
  console.log("LeasingMarketplace impl: ", await upgrades.erc1967.getImplementationAddress(await leasingMarket.getAddress()));

  console.log("\n✅ Deployment complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

