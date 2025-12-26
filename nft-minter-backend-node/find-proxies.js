
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const targetImpls = {
    feeManager: "0x6Ca7A9d428B0a9dCd53bc6128eD282C8dd97B3c5".toLowerCase(),
    wrappedLeasing: "0xEb8E783d3191E268Cc9860EB12BffffdaAc1fCae".toLowerCase(),
    leasingMarketplace: "0x8CE9188089ac3Fb659E69020EFf94C4Cb8AEF1cc".toLowerCase()
};

const manifestPath = "c:\\Users\\kraja\\Desktop\\nft-minter\\smartcontract\\.openzeppelin\\sepolia.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// UUPS implementation slot
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function findProxies() {
    console.log("Analyzing proxies in manifest...");
    for (const proxy of manifest.proxies) {
        try {
            const implData = await provider.getStorage(proxy.address, IMPLEMENTATION_SLOT);
            const implAddress = "0x" + implData.substring(26).toLowerCase();

            for (const [name, target] of Object.entries(targetImpls)) {
                if (implAddress === target) {
                    console.log(`>>> ${name.toUpperCase()} PROXY found at: ${proxy.address}`);
                }
            }
        } catch (e) {
            // console.error(`Error checking ${proxy.address}: ${e.message}`);
        }
    }
}

findProxies();
