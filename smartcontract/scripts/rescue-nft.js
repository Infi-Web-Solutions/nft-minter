const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const marketplaceAddress = process.env.LeasingMarketplace_Address || "0x66E90c59993F3059E2C175809D6931650bBa97A3";
    // The stuck NFT
    const nftAddress = "0x9a93bD18dF04eB9197aec556a4FcA81883645ECB";
    const tokenId = 7;
    // User to return to (using current signer if not specified, but we know the likely owner)
    // Or usage: npx hardhat run scripts/rescue-nft.js --network testnet

    const [signer] = await hre.ethers.getSigners();
    const recipient = signer.address; // Return to deployer/admin, then they can transfer back or list properly

    console.log(`Rescuing NFT ${nftAddress} #${tokenId} from ${marketplaceAddress}`);
    console.log(`Returning to admin: ${recipient}`);

    const LeasingMarketplace = await hre.ethers.getContractFactory("LeasingMarketplace");
    const marketplace = LeasingMarketplace.attach(marketplaceAddress);

    // Call rescueNFT
    const tx = await marketplace.rescueNFT(nftAddress, tokenId, recipient);
    console.log("Transaction sent:", tx.hash);

    await tx.wait();
    console.log("Rescue successful!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
