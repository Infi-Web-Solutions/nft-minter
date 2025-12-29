const hre = require("hardhat");

async function main() {
    const [signer] = await hre.ethers.getSigners();
    console.log("Finishing expired listing with account:", signer.address);

    // LeasingMarketplace address
    const marketplaceAddress = "0x66E90c59993F3059E2C175809D6931650bBa97A3";
    const listingId = 0; // The expired listing ID

    const LeasingMarketplace = await hre.ethers.getContractAt(
        "LeasingMarketplace",
        marketplaceAddress
    );

    console.log("\n=== Before Finishing ===");
    const listingBefore = await LeasingMarketplace.listings(listingId);
    console.log("Listing Status:", listingBefore.status, "(1=Active, 2=Rented, 3=Cancelled, 4=Completed)");
    console.log("Owner:", listingBefore.owner);
    console.log("NFT Address:", listingBefore.nft);
    console.log("Token ID:", listingBefore.tokenId.toString());
    console.log("Listing Expires At:", new Date(Number(listingBefore.listingExpiresAt) * 1000).toLocaleString());
    console.log("Current Time:", new Date().toLocaleString());

    // Check if listing is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime <= listingBefore.listingExpiresAt) {
        console.log("\n❌ ERROR: Listing has not expired yet!");
        console.log(`Time remaining: ${Number(listingBefore.listingExpiresAt) - currentTime} seconds`);
        return;
    }

    console.log("\n✅ Listing is expired. Proceeding to finish...");

    // Call finishExpiredListing
    console.log("\nCalling finishExpiredListing...");
    const tx = await LeasingMarketplace.finishExpiredListing(listingId);
    console.log("Transaction hash:", tx.hash);

    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

    console.log("\n=== After Finishing ===");
    const listingAfter = await LeasingMarketplace.listings(listingId);
    console.log("Listing Status:", listingAfter.status, "(1=Active, 2=Rented, 3=Cancelled, 4=Completed)");

    // Check NFT ownership
    const NFT = await hre.ethers.getContractAt("IERC721", listingBefore.nft);
    const newOwner = await NFT.ownerOf(listingBefore.tokenId);
    console.log("NFT Owner:", newOwner);

    if (newOwner.toLowerCase() === listingBefore.owner.toLowerCase()) {
        console.log("\n✅ SUCCESS! NFT has been returned to the original owner!");
    } else {
        console.log("\n⚠️ WARNING: NFT owner doesn't match expected owner");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
