
import { ethers } from 'ethers';

const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const LEASING_MARKETPLACE = "0xEE257B43400298774f7742a86080334686c6CC9b";

const abi = [
    "function listingCounter() public view returns (uint256)",
    "function listings(uint256) public view returns (address owner, address nft, uint256 tokenId, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration, uint8 status)",
    "function feeManager() public view returns (address)",
    "function getTotalCost(uint256, uint256) public view returns (uint256, uint256, uint256, uint256, uint256)"
];

async function check() {
    const lm = new ethers.Contract(LEASING_MARKETPLACE, abi, provider);

    try {
        const counter = await lm.listingCounter();
        console.log(`Listing Counter: ${counter}`);

        const fm = await lm.feeManager();
        console.log(`FeeManager address: ${fm}`);

        const listing1 = await lm.listings(1);
        console.log(`Listing 1:`, {
            owner: listing1.owner,
            nft: listing1.nft,
            tokenId: listing1.tokenId.toString(),
            pricePerSecond: listing1.pricePerSecond.toString(),
            minDuration: listing1.minDuration.toString(),
            maxDuration: listing1.maxDuration.toString(),
            status: Boolean(listing1.status) ? listing1.status : 0
        });

        console.log("Attempting to call getTotalCost(1, 86400)...");
        try {
            const cost = await lm.getTotalCost(1, 86400);
            console.log("Success! Cost:", cost);
        } catch (e) {
            console.error("getTotalCost FAILED:", e.message);
            if (e.data) console.error("Error data:", e.data);
        }

    } catch (e) {
        console.error("General failure:", e.message);
    }
}

check();
