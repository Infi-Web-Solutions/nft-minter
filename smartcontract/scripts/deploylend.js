const { ethers } = require("hardhat");

async function main() {
    console.log("⏳ Deploying NFTCollateralLendingIntegrated...");

    const [deployer] = await ethers.getSigners();
    console.log("👤 Deployer Address:", deployer.address);

    const Lending = await ethers.getContractFactory("NFTCollateralLendingIntegrated");

    // Contract constructor requires: initialOwner
    const lending = await Lending.deploy(deployer.address);

    console.log("📡 Waiting for deployment...");
    await lending.waitForDeployment();

    console.log("✅ Contract Deployed Successfully!");
    console.log("📍 Contract Address:", await lending.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
