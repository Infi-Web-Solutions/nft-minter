/* eslint-disable no-console */
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  // Configuration for FeeManager
  const MARKETPLACE_FEE_BPS = Number(process.env.MARKETPLACE_FEE_BPS || 250);
  const LENDING_APR_BPS = Number(process.env.LENDING_APR_BPS || 1000);
  const LEASING_FEE_BPS = Number(process.env.LEASING_FEE_BPS || 300);

  console.log("🚀 Starting deployment of all contracts...");
  console.log("👤 Deployer: ", deployer.address);
  console.log("👑 Admin:    ", admin);
  console.log("💰 Treasury: ", treasury);

  // Helper to save addresses
  const deployedAddresses = {
    network: (await ethers.provider.getNetwork()).name,
    timestamp: new Date().toISOString(),
    proxy: {},
    implementation: {},
    standard: {}
  };

  // 1. Deploy FeeManager (UUPS Proxy)
  console.log("\n📦 Deploying FeeManager...");
  const FeeManager = await ethers.getContractFactory("FeeManager");
  const feeManager = await upgrades.deployProxy(
    FeeManager,
    [admin, MARKETPLACE_FEE_BPS, LENDING_APR_BPS, LEASING_FEE_BPS, treasury],
    { kind: "uups", initializer: "initialize" }
  );
  await feeManager.waitForDeployment();
  const feeManagerAddr = await feeManager.getAddress();
  const feeManagerImpl = await upgrades.erc1967.getImplementationAddress(feeManagerAddr);
  deployedAddresses.proxy.FeeManager = feeManagerAddr;
  deployedAddresses.implementation.FeeManager = feeManagerImpl;
  console.log("✅ FeeManager Proxy:         ", feeManagerAddr);
  console.log("   (Implementation:          ", feeManagerImpl + ")");

  // 2. Deploy NFTMarketplace (Standard)
  console.log("\n📦 Deploying NFTMarketplace...");
  const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
  const nftMarketplace = await NFTMarketplace.deploy();
  await nftMarketplace.waitForDeployment();
  const nftMarketplaceAddr = await nftMarketplace.getAddress();
  deployedAddresses.standard.NFTMarketplace = nftMarketplaceAddr;
  console.log("✅ NFTMarketplace:            ", nftMarketplaceAddr);

  // 3. Deploy WrappedLeasing (UUPS Proxy)
  console.log("\n📦 Deploying WrappedLeasing...");
  const WrappedLeasing = await ethers.getContractFactory("WrappedLeasing");
  const wrappedLeasing = await upgrades.deployProxy(
    WrappedLeasing,
    [admin, feeManagerAddr],
    { kind: "uups", initializer: "initialize" }
  );
  await wrappedLeasing.waitForDeployment();
  const wrappedLeasingAddr = await wrappedLeasing.getAddress();
  const wrappedLeasingImpl = await upgrades.erc1967.getImplementationAddress(wrappedLeasingAddr);
  deployedAddresses.proxy.WrappedLeasing = wrappedLeasingAddr;
  deployedAddresses.implementation.WrappedLeasing = wrappedLeasingImpl;
  console.log("✅ WrappedLeasing Proxy:     ", wrappedLeasingAddr);
  console.log("   (Implementation:          ", wrappedLeasingImpl + ")");

  // 4. Deploy LeasingMarketplace (UUPS Proxy)
  console.log("\n📦 Deploying LeasingMarketplace...");
  const LeasingMarketplace = await ethers.getContractFactory("LeasingMarketplace");
  const leasingMarket = await upgrades.deployProxy(
    LeasingMarketplace,
    [admin, feeManagerAddr, wrappedLeasingAddr],
    { kind: "uups", initializer: "initialize" }
  );
  await leasingMarket.waitForDeployment();
  const leasingMarketAddr = await leasingMarket.getAddress();
  const leasingMarketImpl = await upgrades.erc1967.getImplementationAddress(leasingMarketAddr);
  deployedAddresses.proxy.LeasingMarketplace = leasingMarketAddr;
  deployedAddresses.implementation.LeasingMarketplace = leasingMarketImpl;
  console.log("✅ LeasingMarketplace Proxy: ", leasingMarketAddr);
  console.log("   (Implementation:          ", leasingMarketImpl + ")");

  // 5. Deploy NFTCollateralLendingIntegrated (Standard)
  console.log("\n📦 Deploying NFTCollateralLendingIntegrated...");
  const Lending = await ethers.getContractFactory("NFTCollateralLendingIntegrated");
  const lending = await Lending.deploy(admin);
  await lending.waitForDeployment();
  const lendingAddr = await lending.getAddress();
  deployedAddresses.standard.NFTCollateralLendingIntegrated = lendingAddr;
  console.log("✅ NFTCollateralLendingIntegrated:", lendingAddr);

  // 🔗 LINKING & POST-DEPLOYMENT SETUP
  console.log("\n🔗 Running Post-Deployment Configuration...");

  // Link Lending to WrappedLeasing
  process.stdout.write("   - Linking Lending to WrappedLeasing...");
  await (await lending.setWrappedLeasingContract(wrappedLeasingAddr, true)).wait();
  console.log(" DONE");

  // Verify FeeManager settings
  process.stdout.write("   - Verifying FeeManager configuration...");
  const feeBps = await feeManager.leasingFeeBps();
  if (Number(feeBps) !== LEASING_FEE_BPS) {
    console.log(`\n⚠️  Warning: FeeManager reporting ${feeBps} BPS, expected ${LEASING_FEE_BPS}`);
  } else {
    console.log(" DONE");
  }

  // Final Output
  console.log("\n====================================================");
  console.log("🎉 ALL CONTRACTS DEPLOYED SUCCESSFULLY!");
  console.log("====================================================");
  console.log("📢 CRITICAL: USE THESE PROXY ADDRESSES IN .env");
  console.log("----------------------------------------------------");
  console.log(`FEE_MANAGER_ADDRESS=${feeManagerAddr}`);
  console.log(`WrappedLeasing_Address=${wrappedLeasingAddr}`);
  console.log(`LeasingMarketplace_Address=${leasingMarketAddr}`);
  console.log(`NFT_CONTRACT_ADDRESS=${nftMarketplaceAddr}`);
  console.log(`NFTCollateralLendingIntegrated_Address=${lendingAddr}`);
  console.log("----------------------------------------------------");
  console.log("⚠️  DO NOT USE IMPLEMENTATION ADDRESSES IN THE BACKEND");
  console.log("====================================================");

  // Save to file for easy access
  const logDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  const logPath = path.join(logDir, "latest-deployment.json");
  fs.writeFileSync(logPath, JSON.stringify(deployedAddresses, null, 2));
  console.log(`💾 Saved deployment summary to: smartcontract/deployments/latest-deployment.json`);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err);
  process.exit(1);
});