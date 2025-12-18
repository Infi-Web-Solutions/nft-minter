/**
 * Config Controller
 * 
 * Provides public configuration data to the frontend.
 * This keeps sensitive contract addresses on the backend while still
 * making them available to the frontend when needed.
 */

/**
 * Get public configuration
 * Returns contract addresses and other public config data
 */
export const getPublicConfig = async (req, res) => {
    try {
        const config = {
            // Contract Addresses
            contracts: {
                nftMarketplace: process.env.NFT_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS,
                collateralLending: process.env.NFTCollateralLendingIntegrated_Address || process.env.NFT_COLLATERAL_CONTRACT_ADDRESS,
                // Prefer env for flexibility, but fall back to known Sepolia WrappedLeasing proxy
                wrappedLeasing: process.env.WrappedLeasing_Address
                    || process.env.WRAPPED_LEASING_ADDRESS
                    || '0x293a1ac2e749e33effd25c7e292f78ebd8ff7489',
                feeManager: process.env.FeeManager_Address || process.env.FEE_MANAGER_ADDRESS,
                leasingMarketplace: process.env.LeasingMarketplace_Address,
            },
            // Network Configuration
            network: {
                chainId: '0xaa36a7', // Sepolia
                chainIdDecimal: 11155111,
                chainName: 'Sepolia Test Network',
                rpcUrl: process.env.ALCHEMY_API_URL || process.env.sepoliaUrl,
                blockExplorerUrl: 'https://sepolia.etherscan.io'
            },
            // API Configuration
            api: {
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            }
        };

        res.json({ 
            success: true, 
            data: config 
        });
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get configuration' 
        });
    }
};
