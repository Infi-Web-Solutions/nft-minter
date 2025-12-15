
import { ethers } from "ethers";
import {
    provider,
    wrappedLeasing,
    adminWallet
} from "../lib/contracts.js"; // your config file

export class WrappedLeasingService {
    constructor() {
        // Use read-only provider for querying blockchain
        this.contract = wrappedLeasing.connect(provider);
    }

    /** Validate NFT approval status */
    async validateNFTApproval(nftContract, tokenId, ownerAddress) {
        const nftAbi = [
            "function getApproved(uint256 tokenId) public view returns (address)",
            "function isApprovedForAll(address owner, address operator) public view returns (bool)",
            "function ownerOf(uint256 tokenId) public view returns (address)"
        ];

        const nft = new ethers.Contract(nftContract, nftAbi, provider);

        try {
            const owner = await nft.ownerOf(tokenId);
            if (owner.toLowerCase() !== ownerAddress.toLowerCase()) {
                throw new Error("You don't own this NFT");
            }

            const approved = await nft.getApproved(tokenId);
            const approvedForAll = await nft.isApprovedForAll(ownerAddress, this.contract.target);

            const isApproved = approved.toLowerCase() === this.contract.target.toLowerCase() || approvedForAll;
            
            return {
                isApproved,
                needsApproval: !isApproved,
                owner,
                contractAddress: this.contract.target
            };
        } catch (error) {
            if (error.message?.includes("doesn't own")) throw error;
            if (error.message?.includes("ERC721NonexistentToken")) {
                throw new Error(`Token ID ${tokenId} does not exist`);
            }
            throw new Error(`Failed to validate NFT: ${error.message}`);
        }
    }

    /** Calculate required fee for wrapping */
    async calculateWrappingFee(durationDays) {
        try {
            const durationSeconds = Math.floor(durationDays * 24 * 60 * 60);
            
            // Get FeeManager address
            const feeManagerAddr = await this.contract.feeManager();
            if (!feeManagerAddr || feeManagerAddr === '0x0000000000000000000000000000000000000000') {
                throw new Error("FeeManager not configured on WrappedLeasing contract");
            }

            // Simple FeeManager ABI for fee calculation
            const feeManagerAbi = [
                "function leasingFeeBps() external view returns (uint16)",
                "function calcBps(uint256 amount, uint16 bps) external pure returns (uint256)"
            ];

            const feeManager = new ethers.Contract(feeManagerAddr, feeManagerAbi, provider);
            const leasingFeeBps = await feeManager.leasingFeeBps();
            const requiredFee = await feeManager.calcBps(BigInt(durationSeconds), leasingFeeBps);
            
            // Add 10% buffer for gas price variations
            const feeWithBuffer = (requiredFee * BigInt(110)) / BigInt(100);
            
            return {
                durationSeconds,
                requiredFeeWei: requiredFee.toString(),
                feeWithBufferWei: feeWithBuffer.toString(),
                feeWithBufferEth: ethers.formatEther(feeWithBuffer),
                leasingFeeBps: Number(leasingFeeBps)
            };
        } catch (error) {
            console.error('Error calculating wrapping fee:', error);
            throw new Error(`Failed to calculate fee: ${error.message}`);
        }
    }

    /** Validate wrapping parameters */
    async validateWrappingParams(nftContract, tokenId, renterAddress, durationDays) {
        if (!nftContract || !tokenId || !renterAddress || !durationDays) {
            throw new Error("Missing required parameters");
        }

        if (!ethers.isAddress(nftContract)) {
            throw new Error("Invalid NFT contract address");
        }

        if (!ethers.isAddress(renterAddress)) {
            throw new Error("Invalid renter address");
        }

        if (durationDays <= 0) {
            throw new Error("Duration must be greater than 0");
        }

        const feeInfo = await this.calculateWrappingFee(durationDays);
        
        return {
            valid: true,
            ...feeInfo,
            wrappedLeasingAddress: this.contract.target
        };
    }

    /** Get wrapped NFT info */
    async getWrappedInfo(wId) {
        const info = await this.contract.getWrapped(wId);
        return {
            originalNft: info.originalNft,
            originalTokenId: info.originalTokenId.toString(),
            owner: info.owner,
            validUntil: Number(info.validUntil),
            active: info.active
        };
    }

    /** Get lease status */
    async getLeaseStatus(wId) {
        const status = await this.contract.getLeaseStatus(wId);
        return {
            isActive: status.isActive,
            timeRemaining: Number(status.timeRemaining)
        };
    }


    /** Check if admin (using admin wallet) */
    async isAdmin() {
        try {
            // Use admin wallet to check if it's an admin
            const adminContract = wrappedLeasing.connect(adminWallet);
            const adminRole = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const isAdmin = await adminContract.hasRole(adminRole, adminWallet.address);
            console.log(`Admin check for ${adminWallet.address}: ${isAdmin}`);
            return isAdmin;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }


    /** Check FeeManager configured */
    async isFeeManagerConfigured() {
        try {
            const feeManagerAddr = await this.contract.feeManager();
            const isConfigured = feeManagerAddr && feeManagerAddr !== '0x0000000000000000000000000000000000000000';
            console.log(`FeeManager check: address=${feeManagerAddr}, configured=${isConfigured}`);
            return isConfigured;
        } catch (error) {
            console.error('Error checking FeeManager:', error);
            return false;
        }
    }

    /** Set FeeManager address (admin only) */
    async setFeeManager(feeManagerAddress) {
        if (!ethers.isAddress(feeManagerAddress)) {
            throw new Error('Invalid FeeManager address');
        }

        try {
            // Use admin wallet for this transaction
            const adminContract = wrappedLeasing.connect(adminWallet);
            const tx = await adminContract.setFeeManager(feeManagerAddress);
            const receipt = await tx.wait();
            
            console.log('FeeManager configured successfully:', {
                feeManagerAddress,
                transactionHash: receipt.transactionHash
            });
            
            return {
                success: true,
                transactionHash: receipt.transactionHash,
                feeManagerAddress
            };
        } catch (error) {
            console.error('Error setting FeeManager:', error);
            throw new Error(`Failed to set FeeManager: ${error.message}`);
        }
    }

    /** Get wrapped counter */
    async getWCounter() {
        const counter = await this.contract.wCounter();
        return Number(counter);
    }


    /** Check if user can unwrap NFT */
    async canUnwrapNFT(wId, userAddress) {
        try {
            const info = await this.getWrappedInfo(wId);
            const status = await this.getLeaseStatus(wId);
            
            // Can unwrap if: owner is user AND lease is expired (timeRemaining = 0)
            const canUnwrap = info.owner.toLowerCase() === userAddress.toLowerCase() && 
                            (!status.isActive || status.timeRemaining === 0);
            
            return {
                canUnwrap,
                isOwner: info.owner.toLowerCase() === userAddress.toLowerCase(),
                leaseExpired: status.timeRemaining === 0,
                isActive: status.isActive,
                timeRemaining: status.timeRemaining,
                owner: info.owner
            };
        } catch (error) {
            return {
                canUnwrap: false,
                isOwner: false,
                leaseExpired: false,
                isActive: false,
                timeRemaining: 0,
                owner: null,
                error: error.message
            };
        }
    }

    /** Validate environment */
    validateEnvironment() {
        const required = ['RPC_URL', 'WRAPPED_LEASING_ADDRESS'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        // Validate contract addresses
        const wrappedLeasingAddr = process.env.WRAPPED_LEASING_ADDRESS;
        if (!ethers.isAddress(wrappedLeasingAddr)) {
            throw new Error("Invalid WRAPPED_LEASING_ADDRESS format");
        }
        
        return true;
    }

    /** Get contract info for frontend */
    getContractInfo() {
        return {
            wrappedLeasingAddress: this.contract.target,
            networkRpc: process.env.RPC_URL || 'http://localhost:8545'
        };
    }
}

// Singleton export
export const wrappedLeasingService = new WrappedLeasingService();
