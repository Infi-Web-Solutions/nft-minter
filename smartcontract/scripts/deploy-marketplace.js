const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await ethers.getSigners();

    // Sourcing configuration from .env or defaulting to deployer
    const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;
    const feeManagerAddress = process.env.FeeManager_Address;
    const wrappedLeasingAddress = process.env.WrappedLeasing_Address;

    if (!feeManagerAddress) {
        console.error("❌ ERROR: FeeManager_Address not found in .env");
        process.exit(1);
    }

    if (!wrappedLeasingAddress) {
        console.error("❌ ERROR: WrappedLeasing_Address not found in .env");
        process.exit(1);
    }

    console.log("🚀 Starting deployment of LeasingMarketplace...");
    console.log("👤 Deployer:      ", deployer.address);
    console.log("👑 Admin:         ", adminAddress);
    console.log("💰 FeeManager:    ", feeManagerAddress);
    console.log("🎁 WrappedLeasing:", wrappedLeasingAddress);

    // Deploying LeasingMarketplace (UUPS Proxy)
    console.log("\n📦 Deploying LeasingMarketplace Proxy...");
    const LeasingMarketplace = await ethers.getContractFactory("LeasingMarketplace");

    const leasingMarketplace = await upgrades.deployProxy(
        LeasingMarketplace,
        [adminAddress, feeManagerAddress, wrappedLeasingAddress],
        {
            kind: "uups",
            initializer: "initialize"
        }
    );

    await leasingMarketplace.waitForDeployment();

    const proxyAddress = await leasingMarketplace.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n====================================================");
    console.log("🎉 LeasingMarketplace DEPLOYED SUCCESSFULLY!");
    console.log("====================================================");
    console.log(`✅ Proxy Address:         ${proxyAddress}`);
    console.log(`🧩 Implementation:        ${implAddress}`);
    console.log("----------------------------------------------------");
    console.log("📢 Update your .env files with:");
    console.log(`LeasingMarketplace_Address=${proxyAddress}`);
    console.log("====================================================");
}

main().catch((err) => {
    console.error("\n❌ Deployment failed:", err);
    process.exit(1);
});
