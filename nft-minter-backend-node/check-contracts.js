
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const RPC_URL = process.env.sepoliaUrl || "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";

const contracts = {
    wrappedLeasing: "0x7379b98930e74C33E74180253892D3fE38F55CdE",
    feeManager: "0xEFb8FD6b977a07c2F41563d3b7FFE043C141fF11",
    leasingMarketplace: "0xEE257B43400298774f7742a86080334686c6CC9b"
};

const provider = new ethers.JsonRpcProvider(RPC_URL);

async function check() {
    console.log("Checking contracts...");

    const wrappedLeasingAbi = ["function feeManager() public view returns (address)"];
    const leasingMarketplaceAbi = [
        "function feeManager() public view returns (address)",
        "function wrappedContract() public view returns (address)"
    ];

    const wl = new ethers.Contract(contracts.wrappedLeasing, wrappedLeasingAbi, provider);
    const lm = new ethers.Contract(contracts.leasingMarketplace, leasingMarketplaceAbi, provider);

    try {
        const wlFeeManager = await wl.feeManager();
        console.log(`WrappedLeasing.feeManager: ${wlFeeManager}`);
    } catch (e) {
        console.error(`Error reading WrappedLeasing.feeManager: ${e.message}`);
    }

    try {
        const lmFeeManager = await lm.feeManager();
        console.log(`LeasingMarketplace.feeManager: ${lmFeeManager}`);
    } catch (e) {
        console.error(`Error reading LeasingMarketplace.feeManager: ${e.message}`);
    }

    try {
        const lmWrapped = await lm.wrappedContract();
        console.log(`LeasingMarketplace.wrappedContract: ${lmWrapped}`);
    } catch (e) {
        console.error(`Error reading LeasingMarketplace.wrappedContract: ${e.message}`);
    }
}

check();
