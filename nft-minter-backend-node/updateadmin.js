#!/usr/bin/env node
import Web3 from "web3";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// -------------------------
// Setup paths
// -------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, ".env") });

// -------------------------
// Config
// -------------------------
const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";
const FEE_MANAGER_ADDRESS = "0x1a7FFcE06738CF55d7C5251765C1536121F0385C";

const OLD_ADMIN = "0xdA46A64ab8c6BEda14677c49D2Bdd0fC4Bf7b72D";
const NEW_ADMIN = "0xb6795a27f271da619c457fec2dec1c9afbb2f561";

const PRIVATE_KEY = "d62b0e983bb1b4a4e6fef27ce6fc63dc04b4a2d093cfe8935f6474dd38722970";

if (!PRIVATE_KEY) {
    console.error("❌ ERROR: OLD_ADMIN_PRIVATE_KEY missing in .env");
    process.exit(1);
}

// -------------------------
// Load ABI
// -------------------------
const ABI_PATH = path.join(
    __dirname,
    "../smartcontract/artifacts/contracts/FeeManager.sol/FeeManager.json"
);

let abi;
try {
    const file = JSON.parse(fs.readFileSync(ABI_PATH));
    abi = file.abi;
} catch (e) {
    console.error("❌ Failed to load FeeManager ABI:", e.message);
    process.exit(1);
}

// -------------------------
// Web3 Setup
// -------------------------
const web3 = new Web3(RPC_URL);
const account = web3.eth.accounts.wallet.add(PRIVATE_KEY);

const feeManager = new web3.eth.Contract(abi, FEE_MANAGER_ADDRESS);

// DEFAULT_ADMIN_ROLE = 0x00
const DEFAULT_ADMIN_ROLE =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

// -------------------------
// Execute
// -------------------------
async function grantAdminRole() {
    console.log("\n🚀 Granting Admin Role on FeeManager");
    console.log("--------------------------------------");
    console.log("🔑 Old Admin:", OLD_ADMIN);
    console.log("🆕 New Admin:", NEW_ADMIN);
    console.log("📍 Contract:", FEE_MANAGER_ADDRESS, "\n");

    try {
        const tx = await feeManager.methods
            .grantRole(DEFAULT_ADMIN_ROLE, NEW_ADMIN)
            .send({
                from: OLD_ADMIN,
                gas: 200000,
            });

        console.log("✅ Role Granted Successfully!");
        console.log("📜 Tx Hash:", tx.transactionHash, "\n");
        console.log("🎉 New admin now has FULL control.");
    } catch (err) {
        console.error("\n❌ Failed to grant role:");
        console.error(err.message);
    }
}

grantAdminRole();
