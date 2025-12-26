
import { ethers } from 'ethers';

const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const LEASING_MARKETPLACE = "0xdEE544902Ae9C911c0B683F52b7EBCeb0b260De4";

const abi = [
    "function listingCounter() public view returns (uint256)",
    "function listings(uint256) public view returns (address owner, address nft, uint256 tokenId, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration, uint8 status)",
    "function feeManager() public view returns (address)",
    "function wrappedContract() public view returns (address)",
    "function getTotalCost(uint256, uint256) public view returns (uint256, uint256, uint256, uint256, uint256)",
    "function platformFeeBps() public view returns (uint16)",
    "function wrapFeeBps() public view returns (uint16)",
    "function depositBps() public view returns (uint16)"
];

const fmAbi = [
    "function leasingFeeBps() public view returns (uint16)",
    "function calcBps(uint256, uint16) public view returns (uint256)"
];

const wAbi = [
    "function getLeaseStatus(uint256) public view returns (bool, uint256)"
];

async function check() {
    const lm = new ethers.Contract(LEASING_MARKETPLACE, abi, provider);

    try {
        console.log(`Checking LeasingMarketplace at ${LEASING_MARKETPLACE}`);
        const counter = await lm.listingCounter();
        console.log(`Listing Counter: ${counter}`);

        const fmAddr = await lm.feeManager();
        console.log(`FeeManager address: ${fmAddr}`);

        const wrappedAddr = await lm.wrappedContract();
        console.log(`WrappedLeasing address: ${wrappedAddr}`);

        const pFee = await lm.platformFeeBps();
        const wFee = await lm.wrapFeeBps();
        const dFee = await lm.depositBps();
        console.log(`Marketplace Fees: Platform=${pFee}, Wrap=${wFee}, Deposit=${dFee}`);

        const fm = new ethers.Contract(fmAddr, fmAbi, provider);
        const globalLeaseFee = await fm.leasingFeeBps();
        console.log(`Global FeeManager Lease Fee: ${globalLeaseFee}`);

        const w = new ethers.Contract(wrappedAddr, wAbi, provider);
        const [isActive, timeRemaining] = await w.getLeaseStatus(2);
        console.log(`\nParent wNFT #2 Status: isActive=${isActive}, timeRemaining=${timeRemaining.toString()}`);

        console.log("\nInspecting Listing #3:");
        const listing3 = await lm.listings(3);
        console.log(`Listing 3:`, {
            owner: listing3.owner,
            nft: listing3.nft,
            tokenId: listing3.tokenId.toString(),
            pricePerSecond: listing3.pricePerSecond.toString(),
            minDuration: listing3.minDuration.toString(),
            maxDuration: listing3.maxDuration.toString(),
            status: listing3.status
        });

        const durationSeconds = 120;
        console.log(`\nAttempting to call getTotalCost(3, ${durationSeconds})...`);
        try {
            const cost = await lm.getTotalCost(3, durationSeconds);
            console.log("Success! Cost breakdown:", {
                rentAmount: cost[0].toString(),
                deposit: cost[1].toString(),
                platformFee: cost[2].toString(),
                wrapFee: cost[3].toString(),
                totalRequired: cost[4].toString()
            });
        } catch (e) {
            console.error("getTotalCost FAILED:", e.message);
            // If it fails with "duration out of range", that's our culprit
        }

    } catch (e) {
        console.error("General failure:", e.message);
    }
}

check();
