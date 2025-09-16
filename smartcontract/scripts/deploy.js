const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying NFT Marketplace contract...");

  // Get the contract factory
  const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
  
  // Deploy the contract
  const nftMarketplace = await NFTMarketplace.deploy();
  
  // Wait for deployment to finish
  await nftMarketplace.waitForDeployment();
  
  const address = await nftMarketplace.getAddress();
  
  console.log("NFT Marketplace deployed to:", address);
  console.log("Contract owner:", await nftMarketplace.owner());
  console.log("Marketplace fee:", await nftMarketplace.marketplaceFee(), "basis points (2.5%)");
  
  // Verify deployment
  console.log("\nVerifying deployment...");
  console.log("Contract name:", await nftMarketplace.name());
  console.log("Contract symbol:", await nftMarketplace.symbol());
  
  console.log("\nDeployment successful! 🎉");
  console.log("Contract Address:", address);
  console.log("\nNext steps:");
  console.log("1. Update your frontend with the contract address");
  console.log("2. Set up your environment variables");
  console.log("3. Test the contract functions");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 