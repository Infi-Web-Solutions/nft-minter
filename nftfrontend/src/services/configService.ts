/**
 * Config Service
 * 
 * Fetches and caches configuration from the backend.
 * This keeps sensitive data like contract addresses on the server
 * while still making them available to the frontend when needed.
 */

import { apiUrl } from '@/config';

// Configuration cache
let configCache: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

// Types for the configuration
export interface ContractAddresses {
    nftMarketplace: string;
    collateralLending: string;
    wrappedLeasing: string;
    feeManager: string;
    leasingMarketplace: string;
}


export interface NetworkConfig {
    chainId: string;
    chainIdDecimal: number;
    chainName: string;
    rpcUrl: string;
    blockExplorerUrl: string;
}

export interface AppConfig {
    contracts: ContractAddresses;
    network: NetworkConfig;
    api: {
        version: string;
        environment: string;
    };
}

/**
 * Fetch configuration from the backend
 * Caches the result for subsequent calls
 */
async function fetchConfig(): Promise<AppConfig> {
    // Return cached config if available
    if (configCache) {
        return configCache;
    }

    // If a fetch is already in progress, wait for it
    if (configPromise) {
        return configPromise;
    }

    // Start fetching
    configPromise = (async () => {
        try {
            const response = await fetch(apiUrl('/config'));
            const data = await response.json();
            
            if (data.success && data.data) {
                configCache = data.data;
                return data.data;
            } else {
                throw new Error(data.error || 'Failed to fetch config');
            }
        } catch (error) {
            console.error('[ConfigService] Error fetching config:', error);
        } finally {
            configPromise = null;
        }
    })();

    return configPromise;
}

/**
 * Get the full configuration
 */
export async function getConfig(): Promise<AppConfig> {
    return fetchConfig();
}

/**
 * Get contract addresses
 */
export async function getContractAddresses(): Promise<ContractAddresses> {
    const config = await fetchConfig();
    return config.contracts;
}

/**
 * Get the NFT Marketplace contract address
 */
export async function getNFTMarketplaceAddress(): Promise<string> {
    const config = await fetchConfig();
    return config.contracts.nftMarketplace;
}

/**
 * Get the Collateral Lending contract address
 */
export async function getCollateralLendingAddress(): Promise<string> {
    const config = await fetchConfig();
    return config.contracts.collateralLending;
}

/**
 * Get the Wrapped Leasing contract address
 */
export async function getWrappedLeasingAddress(): Promise<string> {
    const config = await fetchConfig();
    return config.contracts.wrappedLeasing;
}

/**
 * Get the Fee Manager contract address
 */
export async function getFeeManagerAddress(): Promise<string> {
    const config = await fetchConfig();
    return config.contracts.feeManager;
}

/**
 * Get the Leasing Marketplace contract address
 */
export async function getLeasingMarketplaceAddress(): Promise<string> {
    const config = await fetchConfig();
    return config.contracts.leasingMarketplace;
}

/**
 * Get network configuration
 */
export async function getNetworkConfig(): Promise<NetworkConfig> {
    const config = await fetchConfig();
    return config.network;
}

/**
 * Clear the config cache (useful for testing or when config might have changed)
 */
export function clearConfigCache(): void {
    configCache = null;
    configPromise = null;
}

/**
 * Pre-fetch config (call this early in your app initialization)
 */
export function prefetchConfig(): void {
    fetchConfig().catch(console.error);
}

// Export a default object for convenience
export const configService = {
    getConfig,
    getContractAddresses,
    getNFTMarketplaceAddress,
    getCollateralLendingAddress,
    getWrappedLeasingAddress,
    getFeeManagerAddress,
    getLeasingMarketplaceAddress,
    getNetworkConfig,
    clearConfigCache,
    prefetchConfig
};

export default configService;
