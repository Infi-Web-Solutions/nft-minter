// import Web3 from 'web3';
// import dotenv from 'dotenv';
// dotenv.config();

// const web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_URL));

// const getNftOwner = async (tokenId) => {
//     try {
//         const contract = new web3.eth.Contract(JSON.parse(process.env.CONTRACT_ABI), process.env.CONTRACT_ADDRESS);
//         const owner = await contract.methods.ownerOf(tokenId).call();
//         return owner;
//     } catch (error) {
//         throw new Error(`Failed to fetch NFT owner: ${error.message}`);
//     }
// };

// const getNftMetadata = async (tokenId) => {
//     try {
//         console.log(`Metadata URI for token ID `);
//         const contract = new web3.eth.Contract(JSON.parse(process.env.CONTRACT_ABI), process.env.CONTRACT_ADDRESS);
//         const metadata = await contract.methods.tokenURI(tokenId).call();
//         console.log(`Metadata URI for token ID ${tokenId}: ${metadata}`);
//         return metadata;
//     } catch (error) {
//         throw new Error(`Failed to fetch NFT metadata: ${error.message}`);
//     }
// };

// const getContractInfo = async () => {
//     try {
//         const contract = new web3.eth.Contract(JSON.parse(process.env.CONTRACT_ABI), process.env.CONTRACT_ADDRESS);
//         const name = await contract.methods.name().call();
//         const symbol = await contract.methods.symbol().call();
//         return { name, symbol };
//     } catch (error) {
//         throw new Error(`Failed to fetch contract info: ${error.message}`);
//     }
// };

// export default {
//     getNftOwner,
//     getNftMetadata,
//     getContractInfo,
// };

import Web3 from 'web3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class NFTMarketplaceWeb3 {
    constructor() {
        console.log("[Web3] Initializing NFTMarketplaceWeb3...");
        
        this.sepoliaUrl = process.env.ALCHEMY_API_URL || "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE";
        this.contractAddress = process.env.NFT_CONTRACT_ADDRESS || "0xAB6FEdb0AdB537166425fd2bBd1F416b99899201";
        
        console.log(`[Web3] Using Sepolia URL: ${this.sepoliaUrl}`);
        console.log(`[Web3] Contract address: ${this.contractAddress}`);
        
        try {
            this.web3 = new Web3(new Web3.providers.HttpProvider(this.sepoliaUrl));
            
            // Test connection
            this.web3.eth.net.isListening()
                .then(() => console.log('[Web3] Successfully connected to Ethereum network'))
                .catch(err => console.error('[Web3] Connection failed:', err));
            
            // Convert to checksum address
            this.contractAddress = this.web3.utils.toChecksumAddress(this.contractAddress);
            console.log(`[Web3] Using checksum address: ${this.contractAddress}`);
            
            // Get contract ABI
            this.contractAbi = this._getContractAbi();
            
            if (!this.contractAbi || this.contractAbi.length === 0) {
                throw new Error("Contract ABI is empty or invalid");
            }
            
            console.log(`[Web3] Loaded ABI with ${this.contractAbi.length} entries`);
            
            // Initialize contract
            this.contract = new this.web3.eth.Contract(this.contractAbi, this.contractAddress);
            console.log("[Web3] Contract successfully initialized");
            
            // Test basic contract calls
            this._testContract();
            
        } catch (error) {
            console.error(`[Web3] Error initializing web3: ${error.message}`);
            throw error;
        }
    }
    
    _getContractAbi() {
        try {
            console.log("[Web3] Getting contract ABI...");
            
            // Try to load from compiled contract artifacts
            const artifactsPath = path.join(
                __dirname,
                '..',
                '..',
                'smartcontract',
                'artifacts',
                'contracts',
                'nftmarketplace.sol',
                'NFTMarketplace.json'
            );
            
            console.log(`[Web3] Looking for contract ABI at: ${artifactsPath}`);
            
            if (fs.existsSync(artifactsPath)) {
                const contractData = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
                if (contractData.abi) {
                    console.log(`[Web3] Successfully loaded ABI from artifacts`);
                    return contractData.abi;
                }
            }
            
            console.log("[Web3] Using fallback ABI");
            // Fallback ABI - matches your Python code
            return [
                {
                    "inputs": [],
                    "stateMutability": "nonpayable",
                    "type": "constructor"
                },
                {
                    "anonymous": false,
                    "inputs": [
                        {"indexed": true, "internalType": "address", "name": "owner", "type": "address"},
                        {"indexed": true, "internalType": "address", "name": "approved", "type": "address"},
                        {"indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256"}
                    ],
                    "name": "Approval",
                    "type": "event"
                },
                {
                    "anonymous": false,
                    "inputs": [
                        {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
                        {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
                        {"indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256"}
                    ],
                    "name": "Transfer",
                    "type": "event"
                },
                {
                    "inputs": [
                        {"internalType": "address", "name": "to", "type": "address"},
                        {"internalType": "uint256", "name": "tokenId", "type": "uint256"}
                    ],
                    "name": "approve",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
                    "name": "balanceOf",
                    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
                    "name": "ownerOf",
                    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "name",
                    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "symbol",
                    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
                    "name": "tokenURI",
                    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        {"internalType": "address", "name": "from", "type": "address"},
                        {"internalType": "address", "name": "to", "type": "address"},
                        {"internalType": "uint256", "name": "tokenId", "type": "uint256"}
                    ],
                    "name": "transferFrom",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ];
        } catch (error) {
            console.error(`[Web3] Error loading ABI: ${error.message}`);
            throw error;
        }
    }
    
    async _testContract() {
        try {
            const name = await this.contract.methods.name().call();
            const symbol = await this.contract.methods.symbol().call();
            console.log(`[Web3] Contract name: ${name}`);
            console.log(`[Web3] Contract symbol: ${symbol}`);
        } catch (error) {
            console.log(`[Web3] Warning: Could not get contract name/symbol: ${error.message}`);
        }
    }
    
    async getNftMetadata(tokenId) {
        try {
            console.log(`[Web3] Getting metadata for token ID: ${tokenId}`);
            
            const tokenURI = await this.contract.methods.tokenURI(tokenId).call();
            const owner = await this.contract.methods.ownerOf(tokenId).call();
            
            console.log(`[Web3] Token URI: ${tokenURI}`);
            
            return {
                token_id: tokenId,
                token_uri: tokenURI,
                owner: owner
            };
        } catch (error) {
            console.error(`[Web3] Error getting NFT metadata: ${error.message}`);
            throw new Error(`Failed to fetch NFT metadata: ${error.message}`);
        }
    }
    
    async getContractInfo() {
        try {
            const name = await this.contract.methods.name().call();
            const symbol = await this.contract.methods.symbol().call();
            const chainId = await this.web3.eth.getChainId();
            
            return {
                name,
                symbol,
                address: this.contractAddress,
                network: 'Sepolia Testnet',
                chainId
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    async getNftOwner(tokenId) {
        try {
            const owner = await this.contract.methods.ownerOf(tokenId).call();
            return owner;
        } catch (error) {
            console.error(`[Web3] Error getting NFT owner: ${error.message}`);
            return null;
        }
    }
    
    async isConnected() {
        try {
            return await this.web3.eth.net.isListening();
        } catch (error) {
            return false;
        }
    }
}

// Create singleton instance
const web3Instance = new NFTMarketplaceWeb3();

export default web3Instance;