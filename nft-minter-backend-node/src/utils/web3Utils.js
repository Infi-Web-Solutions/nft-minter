import Web3 from 'web3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the .env file in the backend directory
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

class NFTMarketplaceWeb3 {
    constructor() {
        console.log("[Web3] Initializing NFTMarketplaceWeb3...");

        this.sepoliaUrl = process.env.sepoliaUrl || process.env.TESTNET_URL || null;
        this.contractAddress = process.env.NFT_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;

        // New lending contract address (deployed NFTCollateralLendingIntegrated)
        this.lendingContractAddress = process.env.NFTCollateralLendingIntegrated_Address || process.env.NFT_COLLATERAL_CONTRACT_ADDRESS || process.env.NFT_COLLATERAL_ADDRESS || null;

        // Wrapped Leasing contract address
        // Prefer env, but fall back to known Sepolia deployment if not set
        this.wrappedLeasingAddress =
            process.env.WrappedLeasing_Address ||
            process.env.WRAPPED_LEASING_ADDRESS ||
            // Fallback: Wrapped Lease NFT (wNFTM) proxy on Sepolia
            '0x293a1ac2e749e33effd25c7e292f78ebd8ff7489';

        // Leasing Marketplace contract address
        this.leasingMarketplaceAddress = process.env.LeasingMarketplace_Address || process.env.LEASING_MARKETPLACE_ADDRESS || null;

        // FeeManager contract address
        this.feeManagerAddress = process.env.FeeManager_Address || process.env.FeeManager_Address || null;

        this.ALCHEMY_API_URL = process.env.ALCHEMY_API_URL || null;

        console.log(`[Web3] Environment variables loaded:`);
        console.log(`[Web3] ALCHEMY_API_URL: ${this.ALCHEMY_API_URL}`);
        console.log(`[Web3] TESTNET_URL: ${process.env.TESTNET_URL ? 'SET' : 'NOT SET'}`);
        console.log(`[Web3] Using Sepolia URL: ${this.sepoliaUrl}`);
        console.log(`[Web3] Contract address: ${this.contractAddress}`);
        console.log(`[Web3] Lending contract address: ${this.lendingContractAddress}`);
        console.log(`[Web3] Wrapped Leasing address: ${this.wrappedLeasingAddress}`);
        console.log(`[Web3] FeeManager address: ${this.feeManagerAddress}`);
        console.log(`[Web3] LeasingMarketplace address: ${this.leasingMarketplaceAddress}`);

        try {
            this.web3 = new Web3(new Web3.providers.HttpProvider(this.sepoliaUrl));

            // Test connection
            this.web3.eth.net.isListening()
                .then(() => console.log('[Web3] Successfully connected to Ethereum network'))
                .catch(err => console.error('[Web3] Connection failed:', err));

            // Convert to checksum address
            this.contractAddress = this.web3.utils.toChecksumAddress(this.contractAddress);
            console.log(`[Web3] Using checksum address: ${this.contractAddress}`);

            // Get contract ABI for marketplace
            this.contractAbi = this._getContractAbi();
            if (!this.contractAbi || this.contractAbi.length === 0) {
                console.warn("[Web3] Contract ABI is empty or invalid for marketplace contract - continuing with limited fallback ABI");
            }
            console.log(`[Web3] Loaded marketplace ABI with ${this.contractAbi ? this.contractAbi.length : 0} entries`);

            // Initialize marketplace contract
            this.contract = new this.web3.eth.Contract(this.contractAbi, this.contractAddress);
            console.log("[Web3] Marketplace contract successfully initialized");

            // Lending contract initialization (if address provided)
            if (this.lendingContractAddress) {
                try {
                    this.lendingContractAddress = this.web3.utils.toChecksumAddress(this.lendingContractAddress);
                    this.lendingAbi = this._getLendingAbi();
                    if (!this.lendingAbi || this.lendingAbi.length === 0) {
                        console.warn('[Web3] Lending ABI empty - using minimal fallback signatures');
                    }
                    this.lendingContract = new this.web3.eth.Contract(this.lendingAbi, this.lendingContractAddress);
                    console.log(`[Web3] Lending contract initialized at ${this.lendingContractAddress}`);
                } catch (err) {
                    console.warn('[Web3] Failed to initialize lending contract:', err.message);
                    this.lendingContract = null;
                }
            } else {
                console.log('[Web3] No lending contract address provided via env; lending features disabled');
                this.lendingContract = null;
            }

            // Wrapped Leasing contract initialization
            if (this.wrappedLeasingAddress) {
                try {
                    this.wrappedLeasingAddress = this.web3.utils.toChecksumAddress(this.wrappedLeasingAddress);
                    this.wrappedLeasingAbi = this._getWrappedLeasingAbi();
                    this.wrappedLeasingContract = new this.web3.eth.Contract(this.wrappedLeasingAbi, this.wrappedLeasingAddress);
                    console.log(`[Web3] WrappedLeasing contract initialized at ${this.wrappedLeasingAddress}`);
                } catch (err) {
                    console.warn('[Web3] Failed to initialize WrappedLeasing contract:', err.message);
                    this.wrappedLeasingContract = null;
                }
            } else {
                console.log('[Web3] No WrappedLeasing address provided');
                this.wrappedLeasingContract = null;
            }

            // LeasingMarketplace contract initialization
            if (this.leasingMarketplaceAddress) {
                try {
                    this.leasingMarketplaceAddress = this.web3.utils.toChecksumAddress(this.leasingMarketplaceAddress);
                    this.leasingMarketplaceAbi = this._getLeasingMarketplaceAbi();
                    this.leasingMarketplaceContract = new this.web3.eth.Contract(this.leasingMarketplaceAbi, this.leasingMarketplaceAddress);
                    console.log(`[Web3] LeasingMarketplace contract initialized at ${this.leasingMarketplaceAddress}`);
                } catch (err) {
                    console.warn('[Web3] Failed to initialize LeasingMarketplace contract:', err.message);
                    this.leasingMarketplaceContract = null;
                }
            } else {
                console.log('[Web3] No LeasingMarketplace address provided');
                this.leasingMarketplaceContract = null;
            }

            // FeeManager contract initialization
            if (this.feeManagerAddress) {
                try {
                    this.feeManagerAddress = this.web3.utils.toChecksumAddress(this.feeManagerAddress);
                    this.feeManagerAbi = this._getFeeManagerAbi();
                    this.feeManagerContract = new this.web3.eth.Contract(this.feeManagerAbi, this.feeManagerAddress);
                    console.log(`[Web3] FeeManager contract initialized at ${this.feeManagerAddress}`);
                } catch (err) {
                    console.warn('[Web3] Failed to initialize FeeManager contract:', err.message);
                    this.feeManagerContract = null;
                }
            } else {
                console.log('[Web3] No FeeManager address provided');
                this.feeManagerContract = null;
            }

            // Test basic marketplace contract calls
            this._testContract();

            // Test lending contract if it exists
            if (this.lendingContract) {
                this._testLendingContract();
            }

            // Test wrapped leasing contract if it exists
            if (this.wrappedLeasingContract) {
                this._testWrappedLeasingContract();
            }

            // Test FeeManager contract if it exists
            if (this.feeManagerContract) {
                this._testFeeManagerContract();
            }

            // Test LeasingMarketplace contract if it exists
            if (this.leasingMarketplaceContract) {
                this._testLeasingMarketplaceContract();
            }

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
                        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
                        { "indexed": true, "internalType": "address", "name": "approved", "type": "address" },
                        { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
                    ],
                    "name": "Approval",
                    "type": "event"
                },
                {
                    "anonymous": false,
                    "inputs": [
                        { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
                        { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
                        { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
                    ],
                    "name": "Transfer",
                    "type": "event"
                },
                {
                    "inputs": [
                        { "internalType": "address", "name": "to", "type": "address" },
                        { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
                    ],
                    "name": "approve",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
                    "name": "balanceOf",
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "ownerOf",
                    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "name",
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "symbol",
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "tokenURI",
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [
                        { "internalType": "address", "name": "from", "type": "address" },
                        { "internalType": "address", "name": "to", "type": "address" },
                        { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
                    ],
                    "name": "transferFrom",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                // External Listing Functions
                {
                    "inputs": [{ "internalType": "address", "name": "nftContract", "type": "address" }, { "internalType": "uint256", "name": "tokenId", "type": "uint256" }, { "internalType": "uint256", "name": "price", "type": "uint256" }],
                    "name": "listExternalNFT",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "nftContract", "type": "address" }, { "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "buyExternalNFT",
                    "outputs": [],
                    "stateMutability": "payable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "nftContract", "type": "address" }, { "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "cancelExternalListing",
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

    // Load lending contract ABI (NFTCollateralLendingIntegrated)
    _getLendingAbi() {
        try {
            console.log('[Web3] Getting lending contract ABI...');
            const lendingArtifactsPath = path.join(
                __dirname,
                '..',
                '..',
                '..',
                'smartcontract',
                'artifacts',
                'contracts',
                'NFTCollateralLendingIntegrated.sol',
                'NFTCollateralLendingIntegrated.json'
            );

            console.log(`[Web3] Looking for lending ABI at: ${lendingArtifactsPath}`);
            if (fs.existsSync(lendingArtifactsPath)) {
                try {
                    const contractData = JSON.parse(fs.readFileSync(lendingArtifactsPath, 'utf8'));
                    if (contractData.abi && contractData.abi.length > 0) {
                        console.log('[Web3] Loaded lending ABI from artifact');
                        return contractData.abi;
                    }
                } catch (err) {
                    console.warn('[Web3] Failed to parse lending artifact:', err.message);
                }
            }

            console.log('[Web3] Using minimal lending fallback ABI');
            // Minimal lending ABI (read & core function signatures)
            return [
                {
                    "inputs": [{ "internalType": "uint256", "name": "loanId", "type": "uint256" }],
                    "name": "computeRepayAmount",
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "loanId", "type": "uint256" }],
                    "name": "fundLoan",
                    "outputs": [],
                    "stateMutability": "payable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "loanId", "type": "uint256" }],
                    "name": "repayLoan",
                    "outputs": [],
                    "stateMutability": "payable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "nftContract", "type": "address" }, { "internalType": "uint256", "name": "tokenId", "type": "uint256" }, { "internalType": "address", "name": "currency", "type": "address" }, { "internalType": "uint256", "name": "principal", "type": "uint256" }, { "internalType": "uint256", "name": "interestBps", "type": "uint256" }, { "internalType": "uint256", "name": "duration", "type": "uint256" }, { "internalType": "uint256", "name": "maxLTV", "type": "uint256" }],
                    "name": "createLoanRequest",
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "loanId", "type": "uint256" }],
                    "name": "cancelLoan",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "loanId", "type": "uint256" }],
                    "name": "liquidateLoan",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "withdrawETH",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "token", "type": "address" }],
                    "name": "withdrawERC20",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "nft", "type": "address" }, { "internalType": "bool", "name": "isWrapped", "type": "bool" }],
                    "name": "setWrappedLeasingContract",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ];
        } catch (error) {
            console.error(`[Web3] Error loading lending ABI: ${error.message}`);
            throw error;
        }
    }

    // Load WrappedLeasing ABI
    _getWrappedLeasingAbi() {
        try {
            console.log('[Web3] Getting WrappedLeasing ABI...');
            const artifactsPath = path.join(
                __dirname,
                '..',
                '..',
                '..',
                'smartcontract',
                'artifacts',
                'contracts',
                'WrappedLeasing.sol',
                'WrappedLeasing.json'
            );

            if (fs.existsSync(artifactsPath)) {
                try {
                    const contractData = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
                    if (contractData.abi && contractData.abi.length > 0) {
                        return contractData.abi;
                    }
                } catch (err) {
                    console.warn('[Web3] Failed to parse WrappedLeasing artifact:', err.message);
                }
            }

            console.log('[Web3] Using minimal WrappedLeasing fallback ABI');
            return [
                {
                    "inputs": [{ "internalType": "address", "name": "nft", "type": "address" }, { "internalType": "uint256", "name": "tokenId", "type": "uint256" }, { "internalType": "address", "name": "renter", "type": "address" }, { "internalType": "uint256", "name": "durationSeconds", "type": "uint256" }, { "internalType": "string", "name": "metadataURI", "type": "string" }],
                    "name": "wrap",
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                    "stateMutability": "payable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "wId", "type": "uint256" }],
                    "name": "unwrap",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "wId", "type": "uint256" }],
                    "name": "getLeaseStatus",
                    "outputs": [{ "internalType": "bool", "name": "isActive", "type": "bool" }, { "internalType": "uint256", "name": "timeRemaining", "type": "uint256" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "wId", "type": "uint256" }],
                    "name": "getWrapped",
                    "outputs": [{ "components": [{ "internalType": "address", "name": "originalNft", "type": "address" }, { "internalType": "uint256", "name": "originalTokenId", "type": "uint256" }, { "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "uint256", "name": "validUntil", "type": "uint256" }, { "internalType": "bool", "name": "active", "type": "bool" }], "internalType": "struct WrappedLeasing.WrappedInfo", "name": "", "type": "tuple" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "pause",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "unpause",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }
            ];
        } catch (error) {
            console.error(`[Web3] Error loading WrappedLeasing ABI: ${error.message}`);
            throw error;
        }
    }

    // Load LeasingMarketplace ABI
    _getLeasingMarketplaceAbi() {
        try {
            console.log('[Web3] Getting LeasingMarketplace ABI...');
            const artifactsPath = path.join(
                __dirname,
                '..',
                '..',
                '..',
                'smartcontract',
                'artifacts',
                'contracts',
                'LeasingMarketplace.sol',
                'LeasingMarketplace.json'
            );

            if (fs.existsSync(artifactsPath)) {
                try {
                    const contractData = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
                    if (contractData.abi && contractData.abi.length > 0) {
                        return contractData.abi;
                    }
                } catch (err) {
                    console.warn('[Web3] Failed to parse LeasingMarketplace artifact:', err.message);
                }
            }

            console.log('[Web3] Using minimal LeasingMarketplace fallback ABI');
            return [
                { "inputs": [{ "internalType": "address", "name": "admin_", "type": "address" }, { "internalType": "address", "name": "feeManager_", "type": "address" }, { "internalType": "address", "name": "wrapped_", "type": "address" }], "name": "initialize", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [], "name": "pause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [], "name": "unpause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [{ "internalType": "address", "name": "nft", "type": "address" }, { "internalType": "uint256", "name": "tokenId", "type": "uint256" }, { "internalType": "uint256", "name": "pricePerSecond", "type": "uint256" }, { "internalType": "uint256", "name": "minDuration", "type": "uint256" }, { "internalType": "uint256", "name": "maxDuration", "type": "uint256" }], "name": "listForRent", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [{ "internalType": "uint256", "name": "listingId", "type": "uint256" }], "name": "cancelListing", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [{ "internalType": "uint256", "name": "listingId", "type": "uint256" }, { "internalType": "uint256", "name": "durationSeconds", "type": "uint256" }], "name": "rent", "outputs": [], "stateMutability": "payable", "type": "function" },
                { "inputs": [{ "internalType": "uint256", "name": "listingId", "type": "uint256" }], "name": "refundDeposit", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [], "name": "withdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [{ "internalType": "uint16", "name": "newPlatformBps", "type": "uint16" }, { "internalType": "uint16", "name": "newWrapBps", "type": "uint16" }], "name": "setFees", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
                { "inputs": [{ "internalType": "uint16", "name": "newDepositBps", "type": "uint16" }], "name": "setDepositBps", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
            ];
        } catch (error) {
            console.error(`[Web3] Error loading LeasingMarketplace ABI: ${error.message}`);
            throw error;
        }
    }

    // Load FeeManager ABI
    _getFeeManagerAbi() {
        try {
            console.log('[Web3] Getting FeeManager ABI...');
            const artifactsPath = path.join(
                __dirname,
                '..',
                '..',
                '..',
                'smartcontract',
                'artifacts',
                'contracts',
                'FeeManager.sol',
                'FeeManager.json'
            );

            if (fs.existsSync(artifactsPath)) {
                try {
                    const contractData = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
                    if (contractData.abi && contractData.abi.length > 0) {
                        console.log('[Web3] Loaded FeeManager ABI from artifact');
                        return contractData.abi;
                    }
                } catch (err) {
                    console.warn('[Web3] Failed to parse FeeManager artifact:', err.message);
                }
            }

            console.log('[Web3] Using minimal FeeManager fallback ABI');
            return [
                {
                    "inputs": [{ "internalType": "address", "name": "admin_", "type": "address" }, { "internalType": "uint16", "name": "marketplaceFeeBps_", "type": "uint16" }, { "internalType": "uint16", "name": "lendingAprBps_", "type": "uint16" }, { "internalType": "uint16", "name": "leasingFeeBps_", "type": "uint16" }, { "internalType": "address", "name": "treasury_", "type": "address" }],
                    "name": "initialize",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "FEE_ADMIN",
                    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "bytes32", "name": "role", "type": "bytes32" }, { "internalType": "address", "name": "account", "type": "address" }],
                    "name": "hasRole",
                    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "DEFAULT_ADMIN_ROLE",
                    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "marketplaceFeeBps",
                    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "lendingAprBps",
                    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "leasingFeeBps",
                    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "treasury",
                    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "calcBps",
                    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                    "stateMutability": "pure",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "setMarketplaceFeeBps",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "setLendingAprBps",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "setLeasingFeeBps",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "address", "name": "treasury_", "type": "address" }],
                    "name": "setTreasury",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function"
                },
                {
                    "anonymous": false,
                    "inputs": [{ "indexed": false, "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "MarketplaceFeeUpdated",
                    "type": "event"
                },
                {
                    "anonymous": false,
                    "inputs": [{ "indexed": false, "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "LendingAprUpdated",
                    "type": "event"
                },
                {
                    "anonymous": false,
                    "inputs": [{ "indexed": false, "internalType": "uint16", "name": "bps", "type": "uint16" }],
                    "name": "LeasingFeeUpdated",
                    "type": "event"
                },
                {
                    "anonymous": false,
                    "inputs": [{ "indexed": false, "internalType": "address", "name": "treasury", "type": "address" }],
                    "name": "TreasuryUpdated",
                    "type": "event"
                }
            ];
        } catch (error) {
            console.error(`[Web3] Error loading FeeManager ABI: ${error.message}`);
            throw error;
        }
    }

    async _testContract() {
        try {
            const contractInfo = await this.getContractInfo();
            if (contractInfo && !contractInfo.error) {
                console.log(`[Web3] Contract name: ${contractInfo.name}`);
                console.log(`[Web3] Contract symbol: ${contractInfo.symbol}`);
                console.log('marketplace:', contractInfo);
            } else {
                console.log(`[Web3] Warning: Could not get contract name/symbol.`);
            }
        } catch (error) {
            console.log(`[Web3] Warning: Could not get contract name/symbol: ${error.message}`);
        }
    }

    async _testLendingContract() {
        try {
            const lendingInfo = await this.getLendingContractInfo();
            if (lendingInfo && !lendingInfo.error) {
                console.log(`[Web3] Lending contract name: ${lendingInfo.name || 'N/A'}`);
                console.log(`[Web3] Lending contract symbol: ${lendingInfo.symbol || 'N/A'}`);
                console.log('lending:', lendingInfo);
            } else if (lendingInfo && lendingInfo.error) {
                console.log(`[Web3] Could not get lending contract info: ${lendingInfo.error}`);
            }
        } catch (error) {
            console.log(`[Web3] Warning: Could not get lending contract info: ${error.message}`);
        }
    }

    async _testWrappedLeasingContract() {
        try {
            const name = await this.wrappedLeasingContract.methods.name().call();
            const symbol = await this.wrappedLeasingContract.methods.symbol().call();
            console.log(`[Web3] WrappedLeasing name: ${name}`);
            console.log(`[Web3] WrappedLeasing symbol: ${symbol}`);
        } catch (error) {
            console.log(`[Web3] Warning: Could not get WrappedLeasing info: ${error.message}`);
        }
    }

    async _testLeasingMarketplaceContract() {
        try {
            const chainId = await this.web3.eth.getChainId();
            console.log(`[Web3] LeasingMarketplace chainId: ${chainId}`);
        } catch (error) {
            console.log(`[Web3] Warning: Could not get LeasingMarketplace info: ${error.message}`);
        }
    }

    async _testFeeManagerContract() {
        try {
            const marketplaceFee = await this.feeManagerContract.methods.marketplaceFeeBps().call();
            const lendingApr = await this.feeManagerContract.methods.lendingAprBps().call();
            const leasingFee = await this.feeManagerContract.methods.leasingFeeBps().call();
            const treasury = await this.feeManagerContract.methods.treasury().call();
            console.log(`[Web3] FeeManager marketplaceFeeBps: ${marketplaceFee}`);
            console.log(`[Web3] FeeManager lendingAprBps: ${lendingApr}`);
            console.log(`[Web3] FeeManager leasingFeeBps: ${leasingFee}`);
            console.log(`[Web3] FeeManager treasury: ${treasury}`);
        } catch (error) {
            console.log(`[Web3] Warning: Could not get FeeManager info: ${error.message}`);
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

    // Get on-chain listing info from the core NFT marketplace contract
    async getOnChainListing(tokenId) {
        try {
            if (!this.contract) {
                throw new Error('Marketplace contract not initialized');
            }
            console.log(`[Web3] Getting on-chain listing for token ID: ${tokenId}`);
            const listing = await this.contract.methods.getListing(tokenId).call();
            return listing;
        } catch (error) {
            console.error('[Web3] Error getting on-chain listing:', error.message);
            throw error;
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

    // Lending contract helpers
    async getLendingContractInfo() {
        if (!this.lendingContract) return { error: 'Lending contract not initialized' };
        try {
            let name = null;
            let symbol = null;
            try {
                name = await this.lendingContract.methods.name().call();
                symbol = await this.lendingContract.methods.symbol().call();
            } catch (e) {
                // Not all lending contracts implement name/symbol
            }
            const chainId = await this.web3.eth.getChainId();
            return {
                name,
                symbol,
                address: this.lendingContractAddress,
                network: 'Sepolia Testnet',
                chainId
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    async computeRepayAmount(loanId) {
        if (!this.lendingContract) {
            throw new Error('Lending contract not initialized');
        }
        try {
            const amount = await this.lendingContract.methods.computeRepayAmount(loanId).call();
            return amount;
        } catch (error) {
            console.error('[Web3] Error computing repay amount:', error.message);
            throw error;
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

    async createLoanRequest(nftContract, tokenId, currency, principal, interestBps, duration, maxLTV, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.createLoanRequest(nftContract, tokenId, currency, principal, interestBps, duration, maxLTV).estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.createLoanRequest(nftContract, tokenId, currency, principal, interestBps, duration, maxLTV).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error creating loan request:', error.message);
            throw error;
        }
    }

    async cancelLoan(loanId, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.cancelLoan(loanId).estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.cancelLoan(loanId).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error cancelling loan:', error.message);
            throw error;
        }
    }

    async fundLoan(loanId, value, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.fundLoan(loanId).estimateGas({ from: fromAddress, value });
            const result = await this.lendingContract.methods.fundLoan(loanId).send({ from: fromAddress, value, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error funding loan:', error.message);
            throw error;
        }
    }

    async repayLoan(loanId, value, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.repayLoan(loanId).estimateGas({ from: fromAddress, value });
            const result = await this.lendingContract.methods.repayLoan(loanId).send({ from: fromAddress, value, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error repaying loan:', error.message);
            throw error;
        }
    }

    async liquidateLoan(loanId, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.liquidateLoan(loanId).estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.liquidateLoan(loanId).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error liquidating loan:', error.message);
            throw error;
        }
    }

    async withdrawETH(fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.withdrawETH().estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.withdrawETH().send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error withdrawing ETH:', error.message);
            throw error;
        }
    }

    async withdrawERC20(tokenAddress, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.withdrawERC20(tokenAddress).estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.withdrawERC20(tokenAddress).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error withdrawing ERC20:', error.message);
            throw error;
        }
    }

    async setWrappedLeasingContract(nftAddress, isWrapped, fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.setWrappedLeasingContract(nftAddress, isWrapped).estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.setWrappedLeasingContract(nftAddress, isWrapped).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error setting wrapped leasing contract:', error.message);
            throw error;
        }
    }

    async withdrawPendingNFTs(fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.withdrawPendingNFTs().estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.withdrawPendingNFTs().send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error withdrawing pending NFTs:', error.message);
            throw error;
        }
    }

    async pauseLending(fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.pause().estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.pause().send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error pausing lending contract:', error.message);
            throw error;
        }
    }

    async unpauseLending(fromAddress) {
        if (!this.lendingContract) throw new Error('Lending contract not initialized');
        try {
            const gas = await this.lendingContract.methods.unpause().estimateGas({ from: fromAddress });
            const result = await this.lendingContract.methods.unpause().send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error unpausing lending contract:', error.message);
            throw error;
        }
    }

    // Wrapped Leasing Methods
    async wrap(nftContract, tokenId, renter, durationSeconds, metadataURI, originalOwner, fromAddress) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const leasingFeeBps = await this.getLeasingFeeBps();
            const wrapFee = (BigInt(durationSeconds) * BigInt(leasingFeeBps)) / 10000n;
            const gas = await this.wrappedLeasingContract.methods.wrap(nftContract, tokenId, renter, durationSeconds, metadataURI, originalOwner).estimateGas({ from: fromAddress, value: wrapFee });
            const result = await this.wrappedLeasingContract.methods.wrap(nftContract, tokenId, renter, durationSeconds, metadataURI, originalOwner).send({ from: fromAddress, gas, value: wrapFee });
            return result;
        } catch (error) {
            console.error('[Web3] Error wrapping NFT:', error.message);
            throw error;
        }
    }

    async unwrap(wId, fromAddress) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const gas = await this.wrappedLeasingContract.methods.unwrap(wId).estimateGas({ from: fromAddress });
            const result = await this.wrappedLeasingContract.methods.unwrap(wId).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error unwrapping NFT:', error.message);
            throw error;
        }
    }

    async pauseWrappedLeasing(fromAddress) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const gas = await this.wrappedLeasingContract.methods.pause().estimateGas({ from: fromAddress });
            return await this.wrappedLeasingContract.methods.pause().send({ from: fromAddress, gas });
        } catch (error) {
            console.error('[Web3] Error pausing WrappedLeasing:', error.message);
            throw error;
        }
    }

    async unpauseWrappedLeasing(fromAddress) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const gas = await this.wrappedLeasingContract.methods.unpause().estimateGas({ from: fromAddress });
            return await this.wrappedLeasingContract.methods.unpause().send({ from: fromAddress, gas });
        } catch (error) {
            console.error('[Web3] Error unpausing WrappedLeasing:', error.message);
            throw error;
        }
    }

    async getLeaseStatus(wId) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const status = await this.wrappedLeasingContract.methods.getLeaseStatus(wId).call();
            return status;
        } catch (error) {
            console.error('[Web3] Error getting lease status:', error.message);
            throw error;
        }
    }

    async getWrapped(wId) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const info = await this.wrappedLeasingContract.methods.getWrapped(wId).call();
            return info;
        } catch (error) {
            console.error('[Web3] Error getting wrapped info:', error.message);
            throw error;
        }
    }

    // LeasingMarketplace Methods
    async listForRent(nftContract, tokenId, pricePerSecond, minDuration, maxDuration, fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.listForRent(nftContract, tokenId, pricePerSecond, minDuration, maxDuration).estimateGas({ from: fromAddress });
            const result = await this.leasingMarketplaceContract.methods.listForRent(nftContract, tokenId, pricePerSecond, minDuration, maxDuration).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error listing for rent:', error.message);
            throw error;
        }
    }

    async cancelListing(listingId, fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.cancelListing(listingId).estimateGas({ from: fromAddress });
            const result = await this.leasingMarketplaceContract.methods.cancelListing(listingId).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error cancelling listing:', error.message);
            throw error;
        }
    }

    async rentListing(listingId, durationSeconds, valueWei, fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.rent(listingId, durationSeconds).estimateGas({ from: fromAddress, value: valueWei });
            const result = await this.leasingMarketplaceContract.methods.rent(listingId, durationSeconds).send({ from: fromAddress, value: valueWei, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error renting listing:', error.message);
            throw error;
        }
    }

    async refundDeposit(listingId, fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.refundDeposit(listingId).estimateGas({ from: fromAddress });
            const result = await this.leasingMarketplaceContract.methods.refundDeposit(listingId).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error refunding deposit:', error.message);
            throw error;
        }
    }

    async withdrawLeasing(fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.withdraw().estimateGas({ from: fromAddress });
            const result = await this.leasingMarketplaceContract.methods.withdraw().send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error withdrawing:', error.message);
            throw error;
        }
    }

    async setLeasingFees(platformBps, wrapBps, fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.setFees(platformBps, wrapBps).estimateGas({ from: fromAddress });
            const result = await this.leasingMarketplaceContract.methods.setFees(platformBps, wrapBps).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error setting leasing fees:', error.message);
            throw error;
        }
    }

    async setDepositBps(newDepositBps, fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.setDepositBps(newDepositBps).estimateGas({ from: fromAddress });
            const result = await this.leasingMarketplaceContract.methods.setDepositBps(newDepositBps).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error setting deposit bps:', error.message);
            throw error;
        }
    }

    async pauseLeasingMarketplace(fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.pause().estimateGas({ from: fromAddress });
            return await this.leasingMarketplaceContract.methods.pause().send({ from: fromAddress, gas });
        } catch (error) {
            console.error('[Web3] Error pausing LeasingMarketplace:', error.message);
            throw error;
        }
    }

    async unpauseLeasingMarketplace(fromAddress) {
        if (!this.leasingMarketplaceContract) throw new Error('LeasingMarketplace contract not initialized');
        try {
            const gas = await this.leasingMarketplaceContract.methods.unpause().estimateGas({ from: fromAddress });
            return await this.leasingMarketplaceContract.methods.unpause().send({ from: fromAddress, gas });
        } catch (error) {
            console.error('[Web3] Error unpausing LeasingMarketplace:', error.message);
            throw error;
        }
    }
    // FeeManager Methods
    async getMarketplaceFeeBps() {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const fee = await this.feeManagerContract.methods.marketplaceFeeBps().call();
            return fee;
        } catch (error) {
            console.error('[Web3] Error getting marketplace fee:', error.message);
            throw error;
        }
    }

    async getLendingAprBps() {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const apr = await this.feeManagerContract.methods.lendingAprBps().call();
            return apr;
        } catch (error) {
            console.error('[Web3] Error getting lending APR:', error.message);
            throw error;
        }
    }

    async getLeasingFeeBps() {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const fee = await this.feeManagerContract.methods.leasingFeeBps().call();
            return fee;
        } catch (error) {
            console.error('[Web3] Error getting leasing fee:', error.message);
            throw error;
        }
    }

    async getTreasury() {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const treasury = await this.feeManagerContract.methods.treasury().call();
            return treasury;
        } catch (error) {
            console.error('[Web3] Error getting treasury:', error.message);
            throw error;
        }
    }

    async calcBps(amount, bps) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const result = await this.feeManagerContract.methods.calcBps(amount, bps).call();
            return result;
        } catch (error) {
            console.error('[Web3] Error calculating BPS:', error.message);
            throw error;
        }
    }

    async checkHasFeeAdminRole(address) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const feeAdminRole = await this.feeManagerContract.methods.FEE_ADMIN().call();
            const hasRole = await this.feeManagerContract.methods.hasRole(feeAdminRole, address).call();
            return hasRole;
        } catch (error) {
            console.error('[Web3] Error checking role:', error.message);
            return false;
        }
    }

    async setMarketplaceFeeBps(bps, fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            // Check if account has role first
            const hasRole = await this.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) {
                throw new Error(`Account ${fromAddress} does not have FEE_ADMIN role`);
            }
            const nonce = await this.web3.eth.getTransactionCount(fromAddress, 'pending');
            const gasPrice = await this.web3.eth.getGasPrice();
            const increasedGasPrice = BigInt(gasPrice) * BigInt(110) / BigInt(100); // 10% increase

            const gas = await this.feeManagerContract.methods.setMarketplaceFeeBps(bps).estimateGas({ from: fromAddress });
            const result = await this.feeManagerContract.methods.setMarketplaceFeeBps(bps).send({
                from: fromAddress,
                gas,
                gasPrice: increasedGasPrice.toString(),
                nonce: nonce
            });
            return result;
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error setting marketplace fee:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    async setLendingAprBps(bps, fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const hasRole = await this.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) {
                throw new Error(`Account ${fromAddress} does not have FEE_ADMIN role`);
            }
            const nonce = await this.web3.eth.getTransactionCount(fromAddress, 'pending');
            const gasPrice = await this.web3.eth.getGasPrice();
            const increasedGasPrice = BigInt(gasPrice) * BigInt(110) / BigInt(100);

            const gas = await this.feeManagerContract.methods.setLendingAprBps(bps).estimateGas({ from: fromAddress });
            const result = await this.feeManagerContract.methods.setLendingAprBps(bps).send({
                from: fromAddress,
                gas,
                gasPrice: increasedGasPrice.toString(),
                nonce: nonce
            });
            return result;
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error setting lending APR:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    async setLeasingFeeBps(bps, fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const hasRole = await this.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) {
                throw new Error(`Account ${fromAddress} does not have FEE_ADMIN role`);
            }
            const nonce = await this.web3.eth.getTransactionCount(fromAddress, 'pending');
            const gasPrice = await this.web3.eth.getGasPrice();
            const increasedGasPrice = BigInt(gasPrice) * BigInt(110) / BigInt(100);

            const gas = await this.feeManagerContract.methods.setLeasingFeeBps(bps).estimateGas({ from: fromAddress });
            const result = await this.feeManagerContract.methods.setLeasingFeeBps(bps).send({
                from: fromAddress,
                gas,
                gasPrice: increasedGasPrice.toString(),
                nonce: nonce
            });
            return result;
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error setting leasing fee:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    async setTreasury(treasuryAddress, fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const hasRole = await this.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) {
                throw new Error(`Account ${fromAddress} does not have FEE_ADMIN role`);
            }
            const nonce = await this.web3.eth.getTransactionCount(fromAddress, 'pending');
            const gasPrice = await this.web3.eth.getGasPrice();
            const increasedGasPrice = BigInt(gasPrice) * BigInt(110) / BigInt(100);

            const gas = await this.feeManagerContract.methods.setTreasury(treasuryAddress).estimateGas({ from: fromAddress });
            const result = await this.feeManagerContract.methods.setTreasury(treasuryAddress).send({
                from: fromAddress,
                gas,
                gasPrice: increasedGasPrice.toString(),
                nonce: nonce
            });
            return result;
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error setting treasury:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    async pauseFeeManager(fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const hasRole = await this.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) throw new Error(`Account ${fromAddress} does not have FEE_ADMIN role`);
            const gas = await this.feeManagerContract.methods.pause().estimateGas({ from: fromAddress });
            return await this.feeManagerContract.methods.pause().send({ from: fromAddress, gas });
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error pausing FeeManager:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    async unpauseFeeManager(fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const hasRole = await this.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) throw new Error(`Account ${fromAddress} does not have FEE_ADMIN role`);
            const gas = await this.feeManagerContract.methods.unpause().estimateGas({ from: fromAddress });
            return await this.feeManagerContract.methods.unpause().send({ from: fromAddress, gas });
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error unpausing FeeManager:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Initialize the FeeManager contract (only if not already initialized)
     * @param {string} adminAddress - Admin address to grant FEE_ADMIN role
     * @param {number} marketplaceFeeBps - Marketplace fee in basis points
     * @param {number} lendingAprBps - Lending APR in basis points
     * @param {number} leasingFeeBps - Leasing fee in basis points
     * @param {string} treasuryAddress - Treasury address
     * @param {string} fromAddress - Address calling initialize (should be deployer/admin)
     * @returns {Promise<Object>} Transaction result
     */
    async initializeFeeManagerContract(adminAddress, marketplaceFeeBps, lendingAprBps, leasingFeeBps, treasuryAddress, fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            console.log('[Web3] Initializing FeeManager contract...');
            const gas = await this.feeManagerContract.methods.initialize(
                adminAddress,
                marketplaceFeeBps,
                lendingAprBps,
                leasingFeeBps,
                treasuryAddress
            ).estimateGas({ from: fromAddress });
            const result = await this.feeManagerContract.methods.initialize(
                adminAddress,
                marketplaceFeeBps,
                lendingAprBps,
                leasingFeeBps,
                treasuryAddress
            ).send({ from: fromAddress, gas });
            console.log('[Web3] FeeManager contract initialized successfully');
            return result;
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error initializing FeeManager contract:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Extract revert reason from error object
     * @private
     */
    _extractRevertReason(error) {
        if (error.message) {
            // Try to extract revert reason from error message
            const revertMatch = error.message.match(/revert (.+?)(?:\s|$)/);
            if (revertMatch) {
                return revertMatch[1] || error.message;
            }
            // Check for encoded revert reasons
            if (error.message.includes('execution reverted')) {
                // Try to decode if there's data
                if (error.data) {
                    try {
                        const reason = this.web3.utils.toAscii(error.data).replace(/\0/g, '');
                        if (reason) return reason;
                    } catch (e) {
                        // Ignore decode errors
                    }
                }
                return 'execution reverted (check permissions and contract state)';
            }
            return error.message;
        }
        return String(error);
    }

    async getFeeManagerInfo() {
        if (!this.feeManagerContract) return { error: 'FeeManager contract not initialized' };
        try {
            const marketplaceFeeBps = await this.feeManagerContract.methods.marketplaceFeeBps().call();
            const lendingAprBps = await this.feeManagerContract.methods.lendingAprBps().call();
            const leasingFeeBps = await this.feeManagerContract.methods.leasingFeeBps().call();
            const treasury = await this.feeManagerContract.methods.treasury().call();
            const chainId = await this.web3.eth.getChainId();
            return {
                marketplaceFeeBps,
                lendingAprBps,
                leasingFeeBps,
                treasury,
                address: this.feeManagerAddress,
                network: 'Sepolia Testnet',
                chainId
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Initialize FeeManager with all fee values at once
     * @param {number} marketplaceFeeBps - Marketplace fee in basis points
     * @param {number} lendingAprBps - Lending APR in basis points
     * @param {number} leasingFeeBps - Leasing fee in basis points
     * @param {string} treasuryAddress - Treasury address
     * @param {string} fromAddress - Admin address with FEE_ADMIN role
     * @returns {Promise<Object>} Object with transaction results
     */
    async initializeFeeManager(marketplaceFeeBps, lendingAprBps, leasingFeeBps, treasuryAddress, fromAddress) {
        if (!this.feeManagerContract) throw new Error('FeeManager contract not initialized');
        try {
            const results = {
                marketplaceFee: null,
                lendingApr: null,
                leasingFee: null,
                treasury: null
            };

            console.log('[Web3] Setting FeeManager values...');

            // Get base gas price and nonce for all transactions
            const baseGasPrice = await this.web3.eth.getGasPrice();
            const increasedGasPrice = BigInt(baseGasPrice) * BigInt(110) / BigInt(100); // 10% increase
            let currentNonce = await this.web3.eth.getTransactionCount(fromAddress, 'pending');

            // Set Marketplace Fee
            const gas1 = await this.feeManagerContract.methods.setMarketplaceFeeBps(marketplaceFeeBps).estimateGas({ from: fromAddress });
            results.marketplaceFee = await this.feeManagerContract.methods.setMarketplaceFeeBps(marketplaceFeeBps).send({
                from: fromAddress,
                gas: gas1,
                gasPrice: increasedGasPrice.toString(),
                nonce: currentNonce++
            });

            // Wait a bit between transactions to avoid nonce issues
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Set Lending APR
            const gas2 = await this.feeManagerContract.methods.setLendingAprBps(lendingAprBps).estimateGas({ from: fromAddress });
            results.lendingApr = await this.feeManagerContract.methods.setLendingAprBps(lendingAprBps).send({
                from: fromAddress,
                gas: gas2,
                gasPrice: increasedGasPrice.toString(),
                nonce: currentNonce++
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            // Set Leasing Fee
            const gas3 = await this.feeManagerContract.methods.setLeasingFeeBps(leasingFeeBps).estimateGas({ from: fromAddress });
            results.leasingFee = await this.feeManagerContract.methods.setLeasingFeeBps(leasingFeeBps).send({
                from: fromAddress,
                gas: gas3,
                gasPrice: increasedGasPrice.toString(),
                nonce: currentNonce++
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            // Set Treasury
            const gas4 = await this.feeManagerContract.methods.setTreasury(treasuryAddress).estimateGas({ from: fromAddress });
            results.treasury = await this.feeManagerContract.methods.setTreasury(treasuryAddress).send({
                from: fromAddress,
                gas: gas4,
                gasPrice: increasedGasPrice.toString(),
                nonce: currentNonce++
            });

            console.log('[Web3] FeeManager values set successfully');
            return results;
        } catch (error) {
            const errorMsg = this._extractRevertReason(error);
            console.error('[Web3] Error setting FeeManager values:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    // External Listing Methods (Marketplace)
    async listExternalNFT(nftContract, tokenId, price, fromAddress) {
        try {
            const gas = await this.contract.methods.listExternalNFT(nftContract, tokenId, price).estimateGas({ from: fromAddress });
            const result = await this.contract.methods.listExternalNFT(nftContract, tokenId, price).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error listing external NFT:', error.message);
            throw error;
        }
    }

    async buyExternalNFT(nftContract, tokenId, value, fromAddress) {
        try {
            const gas = await this.contract.methods.buyExternalNFT(nftContract, tokenId).estimateGas({ from: fromAddress, value });
            const result = await this.contract.methods.buyExternalNFT(nftContract, tokenId).send({ from: fromAddress, value, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error buying external NFT:', error.message);
            throw error;
        }
    }

    async cancelExternalListing(nftContract, tokenId, fromAddress) {
        try {
            const gas = await this.contract.methods.cancelExternalListing(nftContract, tokenId).estimateGas({ from: fromAddress });
            const result = await this.contract.methods.cancelExternalListing(nftContract, tokenId).send({ from: fromAddress, gas });
            return result;
        } catch (error) {
            console.error('[Web3] Error cancelling external listing:', error.message);
            throw error;
        }
    }

    async isConnected() {
        try {
            return await this.web3.eth.net.isListening();
        } catch (error) {
            return false;
        }
    }
    async getExternalNftMetadata(contractAddress, tokenId) {
        try {
            console.log(`[Web3] Fetching external NFT metadata for ${contractAddress} #${tokenId}`);

            // Generic ERC721 ABI + optional marketplace getListing
            const erc721Abi = [
                {
                    "inputs": [],
                    "name": "name",
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [],
                    "name": "symbol",
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "tokenURI",
                    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                {
                    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "ownerOf",
                    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                    "stateMutability": "view",
                    "type": "function"
                },
                // Optional: marketplace listing info (NFTMarketplace-style)
                {
                    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
                    "name": "getListing",
                    "outputs": [
                        {
                            "components": [
                                { "internalType": "address", "name": "seller", "type": "address" },
                                { "internalType": "uint256", "name": "price", "type": "uint256" },
                                { "internalType": "bool", "name": "isActive", "type": "bool" },
                                { "internalType": "bool", "name": "isAuction", "type": "bool" },
                                { "internalType": "uint256", "name": "auctionEndTime", "type": "uint256" },
                                { "internalType": "uint256", "name": "startingPrice", "type": "uint256" },
                                { "internalType": "uint256", "name": "highestBid", "type": "uint256" },
                                { "internalType": "address", "name": "highestBidder", "type": "address" }
                            ],
                            "internalType": "struct NFTMarketplace.Listing",
                            "name": "",
                            "type": "tuple"
                        }
                    ],
                    "stateMutability": "view",
                    "type": "function"
                }
            ];

            const contract = new this.web3.eth.Contract(erc721Abi, contractAddress);

            // Fetch on-chain data
            const [tokenURI, owner, name, symbol] = await Promise.all([
                contract.methods.tokenURI(tokenId).call().catch(() => ''),
                contract.methods.ownerOf(tokenId).call().catch(() => null),
                contract.methods.name().call().catch(() => 'Unknown Collection'),
                contract.methods.symbol().call().catch(() => '')
            ]);

            if (!owner) {
                throw new Error('NFT does not exist or owner could not be fetched');
            }

            // Resolve IPFS URI
            let metadataUrl = tokenURI;
            if (tokenURI.startsWith('ipfs://')) {
                metadataUrl = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
            } else if (!tokenURI.startsWith('http')) {
                // Assume it's a raw IPFS hash if not http/https
                metadataUrl = `https://gateway.pinata.cloud/ipfs/${tokenURI}`;
            }

            console.log(`[Web3] Resolved metadata URL: ${metadataUrl}`);

            // Fetch metadata JSON
            let metadata = {};
            try {
                if (metadataUrl) {
                    const response = await fetch(metadataUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.startsWith('image/')) {
                        console.log(`[Web3] Metadata URL points directly to an image: ${metadataUrl}`);
                        metadata = { image: metadataUrl, name: `NFT #${tokenId}` };
                    } else {
                        metadata = await response.json();
                    }
                    console.log(`[Web3] Fetched metadata:`, metadata);
                }
            } catch (err) {
                console.warn(`[Web3] Failed to fetch metadata JSON from ${metadataUrl}:`, err.message);
                // Try fallback gateway
                if (tokenURI.startsWith('ipfs://')) {
                    const fallbackUrl = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
                    console.log(`[Web3] Trying fallback gateway: ${fallbackUrl}`);
                    try {
                        const response = await fetch(fallbackUrl);
                        if (response.ok) {
                            const contentType = response.headers.get('content-type');
                            if (contentType && contentType.startsWith('image/')) {
                                console.log(`[Web3] Fallback URL points directly to an image: ${fallbackUrl}`);
                                metadata = { image: fallbackUrl, name: `NFT #${tokenId}` };
                            } else {
                                metadata = await response.json();
                            }
                            console.log(`[Web3] Fetched metadata from fallback:`, metadata);
                        }
                    } catch (fallbackErr) {
                        console.warn(`[Web3] Fallback gateway failed:`, fallbackErr.message);
                    }
                }
            }

            // Resolve image IPFS URI
            let imageUrl = metadata.image || metadata.image_url || '';
            if (imageUrl.startsWith('ipfs://')) {
                imageUrl = imageUrl.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
            } else if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = `https://gateway.pinata.cloud/ipfs/${imageUrl}`;
            }

            // Optional: try to read on-chain listing info (if contract supports getListing)
            let listingInfo = null;
            try {
                const rawListing = await contract.methods.getListing(tokenId).call();
                if (rawListing) {
                    const rawPrice = rawListing.price || rawListing[1];
                    const isActive = typeof rawListing.isActive !== 'undefined' ? rawListing.isActive : rawListing[2];
                    const isAuction = typeof rawListing.isAuction !== 'undefined' ? rawListing.isAuction : rawListing[3];
                    const priceEth = rawPrice && rawPrice !== '0'
                        ? this.web3.utils.fromWei(rawPrice.toString(), 'ether')
                        : null;
                    listingInfo = {
                        seller: rawListing.seller || rawListing[0],
                        priceEth,
                        isActive,
                        isAuction
                    };
                    console.log('[Web3] Listing info fetched for external NFT:', listingInfo);
                }
            } catch (e) {
                // Many external ERC721s won't have getListing; that's fine.
                console.log('[Web3] getListing not supported or failed for external NFT:', e.message);
            }

            return {
                success: true,
                name: metadata.name || `${name} #${tokenId}`,
                description: metadata.description || '',
                image: imageUrl,
                token_uri: tokenURI,
                owner_address: owner,
                collection_name: name,
                symbol: symbol,
                metadata: metadata,
                attributes: metadata.attributes || [],
                listing: listingInfo
            };

        } catch (error) {
            console.error(`[Web3] Error fetching external NFT: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

// Create singleton instance
const web3Utils = new NFTMarketplaceWeb3();
export default web3Utils;