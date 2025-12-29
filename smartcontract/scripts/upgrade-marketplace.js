const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

async function main() {
    const proxyAddress = process.env.LeasingMarketplace_Address || "0x66E90c59993F3059E2C175809D6931650bBa97A3";

    console.log("Upgrading LeasingMarketplace at:", proxyAddress);

    const LeasingMarketplace = await ethers.getContractFactory("LeasingMarketplace");
    const upgraded = await upgrades.upgradeProxy(proxyAddress, LeasingMarketplace);

    await upgraded.waitForDeployment();

    console.log("LeasingMarketplace upgraded successfully");
    console.log("Implementation Address:", await upgrades.erc1967.getImplementationAddress(proxyAddress));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
