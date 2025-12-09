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

        this.sepoliaUrl = process.env.sepoliaUrl || null;
        this.contractAddress = process.env.NFT_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;

        // New lending contract address (deployed NFTCollateralLendingIntegrated)
        this.lendingContractAddress = process.env.NFTCollateralLendingIntegrated_Address || process.env.NFT_COLLATERAL_CONTRACT_ADDRESS || process.env.NFT_COLLATERAL_ADDRESS || null;

        // Wrapped Leasing contract address
        this.wrappedLeasingAddress = process.env.WrappedLeasing_Address || process.env.WRAPPED_LEASING_ADDRESS || null;

        this.ALCHEMY_API_URL = process.env.ALCHEMY_API_URL || null;

        console.log(`[Web3] Environment variables loaded:`);
        console.log(`[Web3] ALCHEMY_API_URL: ${this.ALCHEMY_API_URL}`);
        console.log(`[Web3] TESTNET_URL: ${process.env.TESTNET_URL ? 'SET' : 'NOT SET'}`);
        console.log(`[Web3] Using Sepolia URL: ${this.sepoliaUrl}`);
        console.log(`[Web3] Contract address: ${this.contractAddress}`);
        console.log(`[Web3] Lending contract address: ${this.lendingContractAddress}`);
        console.log(`[Web3] Wrapped Leasing address: ${this.wrappedLeasingAddress}`);

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
                }
            ];
        } catch (error) {
            console.error(`[Web3] Error loading WrappedLeasing ABI: ${error.message}`);
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

    // Wrapped Leasing Methods
    async wrap(nftContract, tokenId, renter, durationSeconds, metadataURI, fromAddress) {
        if (!this.wrappedLeasingContract) throw new Error('WrappedLeasing contract not initialized');
        try {
            const gas = await this.wrappedLeasingContract.methods.wrap(nftContract, tokenId, renter, durationSeconds, metadataURI).estimateGas({ from: fromAddress });
            const result = await this.wrappedLeasingContract.methods.wrap(nftContract, tokenId, renter, durationSeconds, metadataURI).send({ from: fromAddress, gas });
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
}

// Create singleton instance
const web3Instance = new NFTMarketplaceWeb3();

export default web3Instance;