const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
    const proxyAddress = process.env.WrappedLeasing_Address;

    if (!proxyAddress) {
        console.error("❌ ERROR: WrappedLeasing_Address (proxy) not found in .env");
        process.exit(1);
    }

    console.log("🚀 Starting upgrade of WrappedLeasing...");
    console.log("📍 Proxy Address: ", proxyAddress);

    const WrappedLeasing = await ethers.getContractFactory("WrappedLeasing");

    console.log("📦 Upgrading implementation...");
    const upgraded = await upgrades.upgradeProxy(proxyAddress, WrappedLeasing);

    await upgraded.waitForDeployment();

    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("\n====================================================");
    console.log("🎉 WrappedLeasing UPGRADED SUCCESSFULLY!");
    console.log("====================================================");
    console.log(`✅ Proxy Address:         ${proxyAddress}`);
    console.log(`🧩 New Implementation:    ${implAddress}`);
    console.log("====================================================");
}

main().catch((err) => {
    console.error("\n❌ Upgrade failed:", err);
    process.exit(1);
});
