#!/usr/bin/env node

/**
 * FeeManager Initialization Script
 * 
 * This script initializes the FeeManager contract with default fee values.
 * Run this once after deploying the FeeManager contract.
 * 
 * Usage:
 *   node initialize-fee-manager.js [adminAddress]
 * 
 * Environment Variables Required:
 *   - FeeManager_Address or FEE_MANAGER_ADDRESS: The deployed FeeManager contract address
 *   - ADMIN_PRIVATE_KEY or PRIVATE_KEY: Private key of the admin account with FEE_ADMIN role
 *   - sepoliaUrl or TESTNET_URL: Sepolia RPC URL
 *   - ADMIN_ADDRESS (optional): Admin address (can also be passed as command line argument)
 * 
 * Default Values:
 *   - Marketplace Fee: 250 bps (2.5%)
 *   - Lending APR: 1000 bps (10%)
 *   - Leasing Fee: 300 bps (3%)
 *   - Treasury: 0xdA46A64ab8c6BEda14677c49D2Bdd0fC4Bf7b72D
 */

import Web3 from 'web3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import web3Instance from './src/utils/web3Utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - try multiple locations for flexibility
// Priority: 1. Backend directory, 2. Project root (matches web3Utils)
const envPaths = [
    path.join(__dirname, '.env'),                    // Backend directory
    path.join(__dirname, '..', '.env'),              // Project root (matches web3Utils)
];

let envLoaded = false;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        console.log(`[Init] Loaded .env from: ${envPath}`);
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.warn('[Init] Warning: No .env file found. Using environment variables from system.');
}

// Configuration
const CONFIG = {
    marketplaceFeeBps: 250,      // 2.5%
    lendingAprBps: 1000,          // 10%
    leasingFeeBps: 300,           // 3%
    treasury: '0xdA46A64ab8c6BEda14677c49D2Bdd0fC4Bf7b72D'
};

async function initializeFeeManager() {
    console.log('\n🚀 FeeManager Initialization Script');
    console.log('=====================================\n');

    try {
        // Get admin address from command line or environment
        const adminAddress = process.argv[2] || process.env.ADMIN_ADDRESS;
        
        if (!adminAddress) {
            throw new Error('Admin address required. Provide as argument or set ADMIN_ADDRESS env variable.');
        }

        // Get private key for signing transactions
        const privateKey = process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
        
        if (!privateKey) {
            throw new Error('Admin private key required. Set ADMIN_PRIVATE_KEY or PRIVATE_KEY env variable.');
        }

        // Check if FeeManager is initialized
        if (!web3Instance.feeManagerContract) {
            throw new Error('FeeManager contract not initialized. Check FeeManager_Address or FEE_MANAGER_ADDRESS in .env file.');
        }

        // Validate required environment variables
        if (!web3Instance.feeManagerAddress) {
            throw new Error('FeeManager address not found. Set FeeManager_Address or FEE_MANAGER_ADDRESS in .env file.');
        }

        if (!web3Instance.sepoliaUrl) {
            throw new Error('Sepolia URL not found. Set sepoliaUrl or TESTNET_URL in .env file.');
        }

        console.log('📋 Configuration:');
        console.log(`   Admin Address: ${adminAddress}`);
        console.log(`   FeeManager Address: ${web3Instance.feeManagerAddress}`);
        console.log(`   Network RPC: ${web3Instance.sepoliaUrl ? 'Configured' : 'NOT SET'}`);
        console.log(`   Marketplace Fee: ${CONFIG.marketplaceFeeBps} bps (${CONFIG.marketplaceFeeBps / 100}%)`);
        console.log(`   Lending APR: ${CONFIG.lendingAprBps} bps (${CONFIG.lendingAprBps / 100}%)`);
        console.log(`   Leasing Fee: ${CONFIG.leasingFeeBps} bps (${CONFIG.leasingFeeBps / 100}%)`);
        console.log(`   Treasury: ${CONFIG.treasury}\n`);

        // Get current values
        console.log('📊 Current FeeManager State:');
        try {
            const currentMarketplaceFee = await web3Instance.getMarketplaceFeeBps();
            const currentLendingApr = await web3Instance.getLendingAprBps();
            const currentLeasingFee = await web3Instance.getLeasingFeeBps();
            const currentTreasury = await web3Instance.getTreasury();
            
            console.log(`   Marketplace Fee: ${currentMarketplaceFee} bps`);
            console.log(`   Lending APR: ${currentLendingApr} bps`);
            console.log(`   Leasing Fee: ${currentLeasingFee} bps`);
            console.log(`   Treasury: ${currentTreasury}\n`);

            // Check if already initialized
            const isZero = currentMarketplaceFee === '0' && 
                          currentLendingApr === '0' && 
                          currentLeasingFee === '0' &&
                          currentTreasury === '0x0000000000000000000000000000000000000000';

            if (!isZero) {
                console.log('⚠️  Warning: FeeManager appears to be already initialized.');
                console.log('   This script will update the values. Continue? (Ctrl+C to cancel)\n');
                await sleep(3000); // Give user time to cancel
            }
        } catch (error) {
            console.log(`   Could not read current state: ${error.message}\n`);
        }

        // Create account from private key for signing
        const web3 = web3Instance.web3;
        const privateKeyHex = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
        const account = web3.eth.accounts.privateKeyToAccount(privateKeyHex);
        const fromAddress = account.address;

        if (fromAddress.toLowerCase() !== adminAddress.toLowerCase()) {
            console.log(`⚠️  Warning: Account address (${fromAddress}) does not match admin address (${adminAddress})`);
            console.log('   Using account address for transactions.\n');
        }

        // Add account to web3 wallet for automatic signing
        // This allows .send() to automatically sign transactions
        if (web3.eth.accounts.wallet.length === 0 || !web3.eth.accounts.wallet[fromAddress]) {
            web3.eth.accounts.wallet.add(account);
        }
        web3.eth.defaultAccount = fromAddress;
        
        // Verify wallet setup
        const walletAccount = web3.eth.accounts.wallet[fromAddress];
        if (!walletAccount) {
            throw new Error('Failed to add account to wallet. Cannot sign transactions.');
        }
        console.log(`   ✓ Account added to wallet for signing\n`);

        // Check if account has FEE_ADMIN role
        console.log('🔐 Checking permissions...\n');
        try {
            const hasRole = await web3Instance.checkHasFeeAdminRole(fromAddress);
            if (!hasRole) {
                console.log('⚠️  Warning: Account does not have FEE_ADMIN role.');
                console.log('   The contract may need to be initialized first.\n');
                
                // Check if contract is initialized (treasury should be set)
                const currentTreasury = await web3Instance.getTreasury();
                const isInitialized = currentTreasury && currentTreasury !== '0x0000000000000000000000000000000000000000';
                
                if (!isInitialized) {
                    console.log('📝 Contract appears uninitialized. Attempting to initialize...\n');
                    try {
                        await web3Instance.initializeFeeManagerContract(
                            fromAddress,  // Admin address
                            CONFIG.marketplaceFeeBps,
                            CONFIG.lendingAprBps,
                            CONFIG.leasingFeeBps,
                            CONFIG.treasury,
                            fromAddress
                        );
                        console.log('✅ Contract initialized successfully!\n');
                        console.log('🎉 FeeManager initialized successfully!\n');
                        process.exit(0);
                    } catch (initError) {
                        console.error(`   ❌ Failed to initialize contract: ${initError.message}\n`);
                        console.error('   💡 Make sure you are the contract deployer or have initialization permissions.\n');
                        throw initError;
                    }
                } else {
                    console.error('   ❌ Account does not have FEE_ADMIN role and contract is already initialized.');
                    console.error('   💡 You need to be granted the FEE_ADMIN role by the current admin.\n');
                    throw new Error('Insufficient permissions: Account does not have FEE_ADMIN role');
                }
            } else {
                console.log('   ✅ Account has FEE_ADMIN role\n');
            }
        } catch (error) {
            console.log(`   ⚠️  Could not check role: ${error.message}\n`);
            console.log('   Continuing anyway...\n');
        }

        console.log('🔄 Starting initialization...\n');

        // Option 1: Use the all-in-one initialization method
        console.log('🚀 Initializing FeeManager with all values at once...\n');
        try {
            const results = await web3Instance.initializeFeeManager(
                CONFIG.marketplaceFeeBps,
                CONFIG.lendingAprBps,
                CONFIG.leasingFeeBps,
                CONFIG.treasury,
                fromAddress
            );
            console.log('   ✅ All values set successfully');
            console.log(`   Marketplace Fee TX: ${results.marketplaceFee.transactionHash}`);
            console.log(`   Lending APR TX: ${results.lendingApr.transactionHash}`);
            console.log(`   Leasing Fee TX: ${results.leasingFee.transactionHash}`);
            console.log(`   Treasury TX: ${results.treasury.transactionHash}\n`);
        } catch (error) {
            console.error(`   ❌ Failed to initialize: ${error.message}\n`);
            
            // Fallback: Try individual calls
            console.log('   ⚠️  Trying individual calls as fallback...\n');
            
            // 1. Set Marketplace Fee
            console.log(`1️⃣  Setting Marketplace Fee to ${CONFIG.marketplaceFeeBps} bps...`);
            try {
                await web3Instance.setMarketplaceFeeBps(CONFIG.marketplaceFeeBps, fromAddress);
                console.log('   ✅ Marketplace fee set successfully\n');
            } catch (err) {
                console.error(`   ❌ Failed: ${err.message}\n`);
                throw err;
            }

            // 2. Set Lending APR
            console.log(`2️⃣  Setting Lending APR to ${CONFIG.lendingAprBps} bps...`);
            try {
                await web3Instance.setLendingAprBps(CONFIG.lendingAprBps, fromAddress);
                console.log('   ✅ Lending APR set successfully\n');
            } catch (err) {
                console.error(`   ❌ Failed: ${err.message}\n`);
                throw err;
            }

            // 3. Set Leasing Fee
            console.log(`3️⃣  Setting Leasing Fee to ${CONFIG.leasingFeeBps} bps...`);
            try {
                await web3Instance.setLeasingFeeBps(CONFIG.leasingFeeBps, fromAddress);
                console.log('   ✅ Leasing fee set successfully\n');
            } catch (err) {
                console.error(`   ❌ Failed: ${err.message}\n`);
                throw err;
            }

            // 4. Set Treasury
            console.log(`4️⃣  Setting Treasury to ${CONFIG.treasury}...`);
            try {
                await web3Instance.setTreasury(CONFIG.treasury, fromAddress);
                console.log('   ✅ Treasury set successfully\n');
            } catch (err) {
                console.error(`   ❌ Failed: ${err.message}\n`);
                throw err;
            }
        }

        // Verify the setup
        console.log('🔍 Verifying configuration...\n');
        const finalMarketplaceFee = await web3Instance.getMarketplaceFeeBps();
        const finalLendingApr = await web3Instance.getLendingAprBps();
        const finalLeasingFee = await web3Instance.getLeasingFeeBps();
        const finalTreasury = await web3Instance.getTreasury();

        console.log('✅ Final FeeManager State:');
        console.log(`   Marketplace Fee: ${finalMarketplaceFee} bps (${finalMarketplaceFee / 100}%)`);
        console.log(`   Lending APR: ${finalLendingApr} bps (${finalLendingApr / 100}%)`);
        console.log(`   Leasing Fee: ${finalLeasingFee} bps (${finalLeasingFee / 100}%)`);
        console.log(`   Treasury: ${finalTreasury}\n`);

        // Verify values match
        const allCorrect = 
            parseInt(finalMarketplaceFee) === CONFIG.marketplaceFeeBps &&
            parseInt(finalLendingApr) === CONFIG.lendingAprBps &&
            parseInt(finalLeasingFee) === CONFIG.leasingFeeBps &&
            finalTreasury.toLowerCase() === CONFIG.treasury.toLowerCase();

        if (allCorrect) {
            console.log('🎉 FeeManager initialized successfully!\n');
            process.exit(0);
        } else {
            console.log('⚠️  Warning: Some values do not match expected configuration.\n');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Initialization failed:');
        console.error(`   ${error.message}\n`);
        
        // Provide helpful error messages based on error type
        if (error.message.includes('FEE_ADMIN role') || error.message.includes('onlyRole')) {
            console.error('   ⚠️  Permission Error: Account does not have FEE_ADMIN role.\n');
            console.error('   💡 Solutions:');
            console.error('      1. If contract is not initialized, the script will try to initialize it automatically.');
            console.error('      2. If contract is already initialized, you need to be granted FEE_ADMIN role by the current admin.');
            console.error('      3. Make sure you are using the correct admin account.\n');
        } else if (error.message.includes('insufficient funds')) {
            console.error('   ⚠️  Insufficient Funds: Account does not have enough ETH for gas fees.\n');
            console.error('   💡 Make sure the admin account has enough ETH for transaction gas.\n');
        } else if (error.message.includes('execution reverted')) {
            console.error('   ⚠️  Transaction Reverted: The contract rejected the transaction.\n');
            console.error('   💡 Common causes:');
            console.error('      - Account does not have required permissions (FEE_ADMIN role)');
            console.error('      - Contract validation failed (e.g., invalid fee values)');
            console.error('      - Contract not initialized and initialize() call failed\n');
        } else if (error.message.includes('Contract not initialized')) {
            console.error('   ⚠️  Contract Not Found: FeeManager contract address is invalid or not deployed.\n');
            console.error('   💡 Check that FeeManager_Address in .env is correct.\n');
        }
        
        process.exit(1);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the script
initializeFeeManager();

