const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await ethers.getSigners();

    // Sourcing configuration from .env or defaulting to deployer
    const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;
    const feeManagerAddress = process.env.FeeManager_Address;

    if (!feeManagerAddress) {
        console.error("❌ ERROR: FeeManager_Address not found in .env");
        process.exit(1);
    }

    console.log("🚀 Starting deployment of WrappedLeasing...");
    console.log("👤 Deployer:      ", deployer.address);
    console.log("👑 Admin:         ", adminAddress);
    console.log("💰 FeeManager:    ", feeManagerAddress);

    // Deploying WrappedLeasing (UUPS Proxy)
    console.log("\n📦 Deploying WrappedLeasing Proxy...");
    const WrappedLeasing = await ethers.getContractFactory("WrappedLeasing");

    const wrappedLeasing = await upgrades.deployProxy(
        WrappedLeasing,
        [adminAddress, feeManagerAddress],
        {
            kind: "uups",
            initializer: "initialize"
        }
    );

    await wrappedLeasing.waitForDeployment();

    const proxyAddress = await wrappedLeasing.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n====================================================");
    console.log("🎉 WrappedLeasing DEPLOYED SUCCESSFULLY!");
    console.log("====================================================");
    console.log(`✅ Proxy Address:         ${proxyAddress}`);
    console.log(`🧩 Implementation:        ${implAddress}`);
    console.log("----------------------------------------------------");
    console.log("📢 Update your .env files with:");
    console.log(`WrappedLeasing_Address=${proxyAddress}`);
    console.log("====================================================");
}

main().catch((err) => {
    console.error("\n❌ Deployment failed:", err);
    process.exit(1);
});
