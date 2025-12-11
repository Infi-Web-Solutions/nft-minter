

// Centralized frontend configuration
export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL;

// Sepolia Network Configuration
export const NETWORK_CONFIG = {
  chainId: '0xaa36a7', // Sepolia chain ID in hex
  chainIdDecimal: 11155111, // Sepolia chain ID in decimal
  chainName: 'Sepolia Test Network',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE'],
  blockExplorerUrls: ['https://sepolia.etherscan.io']
};


// Helper to build full API URLs safely
export function apiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  // Remove trailing slash from base URL if exists
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  // Remove leading slash from path if exists
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBaseUrl}${cleanPath}`;
}

// Helper to add Sepolia network to MetaMask
export async function addSepoliaNetwork() {
  if (!window.ethereum) return false;
  
  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: NETWORK_CONFIG.chainId,
        chainName: NETWORK_CONFIG.chainName,
        nativeCurrency: NETWORK_CONFIG.nativeCurrency,
        rpcUrls: NETWORK_CONFIG.rpcUrls,
        blockExplorerUrls: NETWORK_CONFIG.blockExplorerUrls
      }]
    });
    return true;
  } catch (error) {
    console.error('Error adding Sepolia network:', error);
    return false;
  }
}

// Helper to switch to Sepolia network
export async function switchToSepoliaNetwork() {
  if (!window.ethereum) return false;
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: NETWORK_CONFIG.chainId }]
    });
    return true;
  } catch (error: any) {
    if (error.code === 4902) {
      // Network needs to be added
      return await addSepoliaNetwork();
    }
    console.error('Error switching to Sepolia network:', error);
    return false;
  }
}

// Prefetch configuration from backend at app startup
// This is imported dynamically to avoid circular dependencies
import('./services/configService').then(({ prefetchConfig }) => {
  prefetchConfig();
}).catch(() => {
  // Config service not available yet, will be loaded when needed
});





