import { createConfig, http, WagmiProvider } from 'wagmi';
import { sepolia, mainnet, polygon } from 'wagmi/chains';
import { createWeb3Modal } from '@web3modal/wagmi';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn(
    'VITE_WALLETCONNECT_PROJECT_ID is not set. Please add it to your .env file from https://cloud.walletconnect.com/'
  );
}

// Create wagmi config
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, polygon],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http('https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE'),
    [polygon.id]: http(),
  },
  ssr: false,
});

// Initialize Web3Modal
if (projectId) {
  createWeb3Modal({
    wagmiConfig,
    projectId,
    enableAnalytics: true,
    themeMode: 'dark',
  });
}

export default wagmiConfig;
