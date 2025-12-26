import Web3 from "web3";
import fs from "fs";
import path from "path";

const RPC = "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";
const CONTRACT = "0x6Ca7A9d428B0a9dCd53bc6128eD282C8dd97B3c5"; // FeeManager proxy

// Addresses to test
const ADDRESSES = [
  // old admin
  "0xb6795a27f271da619c457fec2dec1c9afbb2f561", // new admin
  "0xdA46A64ab8c6BEda14677c49D2Bdd0fC4Bf7b72D",
];

// CORRECT ABI PATH
const ABI_PATH = path.join(
  "C:/Users/kraja/Desktop/nft-minter/smartcontract/artifacts/contracts/FeeManager.sol/FeeManager.json"
);

// Load ABI
const abi = JSON.parse(fs.readFileSync(ABI_PATH)).abi;

const web3 = new Web3(RPC);
const feeManager = new web3.eth.Contract(abi, CONTRACT);

const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

async function main() {
  console.log("Checking admin roles...\n");

  for (const addr of ADDRESSES) {
    const has = await feeManager.methods.hasRole(DEFAULT_ADMIN_ROLE, addr).call();
    console.log(addr, " → ", has ? "✔ HAS ADMIN" : "❌ NO ADMIN");
  }
}

main();
