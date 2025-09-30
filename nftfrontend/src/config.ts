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

// Contract addresses
export const CONTRACT_ADDRESS = "0xAB6FEdb0AdB537166425fd2bBd1F416b99899201";

// Helper to build full API URLs safely
export function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

// Normalize media URLs (avatars, banners, NFT images) to absolute URLs
export function mediaUrl(url?: string | null): string {
  if (!url) return '';

  const original = url; // preserve query strings if any

  // IPFS
  if (original.startsWith('ipfs://')) {
    const ipfsHash = original.replace('ipfs://', '').replace(/\/+$/, '');
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  }

  // Already absolute (http/https or data URI)
  if (/^(https?:)?\/\//i.test(original) || original.startsWith('data:')) {
    // Rewrite localhost to API base origin but keep path and query
    try {
      const base = API_BASE_URL.replace(/\/$/, '');
      const baseOrigin = new URL(base).origin;
      const u = new URL(original);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return `${baseOrigin}${u.pathname}${u.search}`;
      }
    } catch {
      // ignore URL parsing errors
    }
    return original;
  }

  // Handle typical Django media relative paths like /media/.... or media/...
  if (original.startsWith('/media/') || original.startsWith('media/')) {
    const path = original.startsWith('/') ? original : `/${original}`;
    try { console.debug('[mediaUrl] Resolving relative media path', { original, resolved: apiUrl(path) }); } catch {}
    return apiUrl(path);
  }

  // Fallback: treat as relative path under API
  const fallback = apiUrl(original.startsWith('/') ? original : `/${original}`);
  try { console.debug('[mediaUrl] Fallback URL resolution', { original, resolved: fallback }); } catch {}
  return fallback;
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


