/**
 * Loan Auto-Liquidation Service
 * 
 * This service runs periodically to check for expired loans and automatically
 * triggers liquidation when the loan duration has passed and the borrower hasn't repaid.
 * 
 * Note: For blockchain-based automatic liquidation, we need a server-side wallet
 * with funds to pay gas fees. The current implementation updates the backend status
 * and can optionally trigger blockchain liquidation.
 */

import Loan from '../models/loan.js';
import NFT from '../models/nft.js';
import web3Utils from '../utils/web3Utils.js';

// Check interval in milliseconds (default: every 1 minute)
const CHECK_INTERVAL = parseInt(process.env.LOAN_CHECK_INTERVAL) || 60000;

// Server wallet for auto-liquidation (optional - requires PRIVATE_KEY in .env)
let serverWalletAddress = null;
let canAutoLiquidate = false;

class LoanAutoLiquidationService {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.web3Service = null;
    }

    /**
     * Initialize the service
     */
    async initialize() {
        try {
            // Use the existing web3Utils singleton - it's already initialized
            this.web3Service = web3Utils;

            // Check if we have a server wallet for auto-liquidation
            if (process.env.AUTO_LIQUIDATION_PRIVATE_KEY) {
                const Web3 = (await import('web3')).default;
                const web3 = new Web3();
                const account = web3.eth.accounts.privateKeyToAccount(process.env.AUTO_LIQUIDATION_PRIVATE_KEY);
                serverWalletAddress = account.address;
                canAutoLiquidate = true;
                console.log('[AutoLiquidation] Server wallet configured for auto-liquidation:', serverWalletAddress);
            } else {
                console.log('[AutoLiquidation] No server wallet configured. Auto-liquidation will only update DB status.');
                console.log('[AutoLiquidation] To enable blockchain auto-liquidation, set AUTO_LIQUIDATION_PRIVATE_KEY in .env');
            }

            console.log('[AutoLiquidation] Service initialized');
            return true;
        } catch (error) {
            console.error('[AutoLiquidation] Failed to initialize:', error.message);
            return false;
        }
    }

    /**
     * Start the auto-liquidation scheduler
     */
    start() {
        if (this.isRunning) {
            console.log('[AutoLiquidation] Service already running');
            return;
        }

        this.isRunning = true;
        console.log(`[AutoLiquidation] Starting service. Check interval: ${CHECK_INTERVAL / 1000}s`);

        // Run immediately on start
        this.checkExpiredLoans();

        // Then run periodically
        this.intervalId = setInterval(() => {
            this.checkExpiredLoans();
        }, CHECK_INTERVAL);
    }

    /**
     * Stop the auto-liquidation scheduler
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[AutoLiquidation] Service stopped');
    }

    /**
     * Check for expired loans and process them
     */
    async checkExpiredLoans() {
        try {
            const currentTime = Math.floor(Date.now() / 1000);
            
            // Find all funded loans that have expired
            // A loan is expired when: startTime + duration < currentTime
            const fundedLoans = await Loan.find({ status: 'Funded' });

            if (fundedLoans.length === 0) {
                return;
            }

            console.log(`[AutoLiquidation] Checking ${fundedLoans.length} funded loans for expiration...`);

            for (const loan of fundedLoans) {
                const expiryTime = loan.startTime + loan.duration;
                
                if (currentTime > expiryTime) {
                    console.log(`[AutoLiquidation] Loan #${loan.loanId} has expired. Expiry: ${new Date(expiryTime * 1000).toISOString()}`);
                    await this.processExpiredLoan(loan);
                }
            }
        } catch (error) {
            console.error('[AutoLiquidation] Error checking expired loans:', error.message);
        }
    }

    /**
     * Process an expired loan - attempt liquidation
     * Note: We only update the database if we can successfully execute the blockchain transaction.
     * If we can't auto-liquidate (no server wallet or wallet mismatch), we just log a warning
     * and the lender must manually liquidate via the frontend.
     */
    async processExpiredLoan(loan) {
        try {
            console.log(`[AutoLiquidation] Processing expired loan #${loan.loanId}...`);
            console.log(`[AutoLiquidation] Lender: ${loan.lender}`);
            console.log(`[AutoLiquidation] Borrower: ${loan.borrower}`);

            // If we have a server wallet configured and it matches the lender, auto-liquidate
            if (canAutoLiquidate && serverWalletAddress && 
                loan.lender.toLowerCase() === serverWalletAddress.toLowerCase()) {
                
                console.log(`[AutoLiquidation] Attempting blockchain liquidation for loan #${loan.loanId}...`);
                
                try {
                    await this.web3Service.liquidateLoan(loan.loanId, serverWalletAddress);
                    console.log(`[AutoLiquidation] ✅ Loan #${loan.loanId} liquidated on blockchain`);
                    
                    // Only update database after successful blockchain transaction
                    loan.status = 'Liquidated';
                    await loan.save();
                    console.log(`[AutoLiquidation] ✅ Loan #${loan.loanId} status updated to Liquidated in DB`);

                    // Update NFT ownership in database
                    await this.updateNFTOwnership(loan);
                    
                } catch (blockchainError) {
                    console.error(`[AutoLiquidation] Blockchain liquidation failed:`, blockchainError.message);
                    // Don't update DB if blockchain call failed - keep the loan as "Funded"
                    // The lender will see the "Liquidate" button in the UI
                    return;
                }
            } else {
                // Can't auto-liquidate - just log a warning
                // The loan stays as "Funded" but expired - frontend will show the Liquidate button
                console.log(`[AutoLiquidation] ⚠️ Loan #${loan.loanId} is expired but cannot be auto-liquidated`);
                console.log(`[AutoLiquidation] Reason: No server wallet configured or wallet doesn't match lender`);
                console.log(`[AutoLiquidation] The lender (${loan.lender}) must manually liquidate this loan via the frontend`);
            }

        } catch (error) {
            console.error(`[AutoLiquidation] Error processing loan #${loan.loanId}:`, error.message);
        }
    }

    /**
     * Update NFT ownership after liquidation
     */
    async updateNFTOwnership(loan) {
        try {
            let nft = await NFT.findOne({ 
                contract_address: loan.nftContract,
                token_id: loan.tokenId 
            });
            
            if (!nft) {
                nft = await NFT.findOne({ token_id: loan.tokenId });
            }
            
            if (nft && loan.lender) {
                console.log(`[AutoLiquidation] Updating NFT ownership - Previous: ${nft.owner_address}, New: ${loan.lender}`);
                nft.owner_address = loan.lender.toLowerCase();
                nft.is_listed = false;
                await nft.save();
                console.log(`[AutoLiquidation] ✅ NFT ownership transferred to lender`);
            } else {
                console.log(`[AutoLiquidation] NFT not found in database (external NFT)`);
            }
        } catch (error) {
            console.error('[AutoLiquidation] Error updating NFT ownership:', error.message);
        }
    }

    /**
     * Get status of the service
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            canAutoLiquidate,
            checkInterval: CHECK_INTERVAL,
            serverWallet: serverWalletAddress ? `${serverWalletAddress.slice(0, 6)}...${serverWalletAddress.slice(-4)}` : null
        };
    }
}

// Singleton instance
const loanAutoLiquidationService = new LoanAutoLiquidationService();

export default loanAutoLiquidationService;
