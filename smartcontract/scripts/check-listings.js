const hre = require("hardhat");

async function main() {
    const marketplaceAddress = "0x66E90c59993F3059E2C175809D6931650bBa97A3";
    const nftAddress = "0x9a93bD18dF04eB9197aec556a4FcA81883645ECB";
    const tokenId = 7;

    console.log(`Checking listings on Marketplace: ${marketplaceAddress}`);
    console.log(`Looking for NFT: ${nftAddress} #${tokenId}`);

    const LeasingMarketplace = await hre.ethers.getContractFactory("LeasingMarketplace");
    const marketplace = LeasingMarketplace.attach(marketplaceAddress);

    const counter = await marketplace.listingCounter();
    console.log(`Current Listing Counter: ${counter}`);

    // Check the NFT owner
    const ERC721 = await hre.ethers.getContractAt("IERC721", nftAddress);
    const owner = await ERC721.ownerOf(tokenId);
    console.log(`NFT Owner on-chain: ${owner}`);

    if (owner.toLowerCase() !== marketplaceAddress.toLowerCase()) {
        console.log("WARNING: NFT is NOT owned by the marketplace!");
    } else {
        console.log("Confirmed: NFT is owned by the marketplace.");
    }

    // Scan all listings
    console.log("Scanning listings...");
    for (let i = 0; i < counter; i++) {
        try {
            const listing = await marketplace.listings(i);
            console.log(`Listing ID ${i}:`);
            console.log(`  - Create by: ${listing.owner}`);
            console.log(`  - NFT: ${listing.nft}`);
            console.log(`  - TokenID: ${listing.tokenId}`);
            console.log(`  - Status: ${listing.status} (1=Active, 2=Rented, 3=Cancelled, 4=Finished)`);

            if (listing.nft.toLowerCase() === nftAddress.toLowerCase() && listing.tokenId.toString() === tokenId.toString()) {
                console.log("!!! MATCH FOUND !!!");
            }
        } catch (e) {
            console.log(`Error reading listing ${i}: ${e.message}`);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
