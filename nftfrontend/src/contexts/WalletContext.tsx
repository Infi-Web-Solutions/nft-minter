
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ethers } from 'ethers';
import detectEthereumProvider from '@metamask/detect-provider';
import { web3Service } from '@/services/web3Service';
import { createOrUpdateProfile } from '@/services/profileService';
import { toast } from 'sonner';

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is already connected on mount
  useEffect(() => {
    checkWalletConnection();
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('disconnect', handleDisconnect);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      };
    }
  }, []);

  const checkWalletConnection = async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          await connectToWallet(accounts[0]);
        }
      }
    } catch (err) {
      console.error('Error checking wallet connection:', err);
    }
  };

  const connectWallet = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (!window.ethereum) {
        throw new Error('No Ethereum wallet detected. Please install MetaMask or another Web3 wallet.');
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });

      if (accounts.length > 0) {
        await connectToWallet(accounts[0]);
      } else {
        throw new Error('No accounts found. Please connect your wallet.');
      }
    } catch (err: any) {
      console.error('Error connecting wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const connectToWallet = async (accountAddress: string) => {
    try {
      if (!window.ethereum) throw new Error('No Ethereum provider found');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(accountAddress);

      setProvider(provider);
      setSigner(signer);
      setAddress(accountAddress);
      setChainId(Number(network.chainId));
      setBalance(ethers.formatEther(balance));
      setIsConnected(true);
      setError(null);

      // Initialize Web3Service
      await web3Service.initialize(provider);

      // Store connection state in localStorage
      localStorage.setItem('walletConnected', 'true');
      localStorage.setItem('walletAddress', accountAddress);

      // Create/update user profile in backend
      const profileCreated = await createOrUpdateProfile(accountAddress);
      if (profileCreated) {
        toast.success('Profile initialized successfully');
      }
    } catch (err: any) {
      console.error('Error connecting to wallet:', err);
      setError(err.message || 'Failed to connect to wallet');
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress(null);
    setBalance(null);
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setError(null);

    // Clear localStorage
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletAddress');
  };

  const switchNetwork = async (targetChainId: number) => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (err: any) {
      console.error('Error switching network:', err);
      setError(err.message || 'Failed to switch network');
    }
  };

  const handleAccountsChanged = async (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected their wallet
      disconnectWallet();
    } else {
      // User switched accounts
      await connectToWallet(accounts[0]);
    }
  };

  const handleChainChanged = async (chainId: string) => {
    // Reload the page when chain changes
    window.location.reload();
  };

  const handleDisconnect = () => {
    disconnectWallet();
  };

  const value: WalletContextType = {
    isConnected,
    address,
    balance,
    chainId,
    provider,
    signer,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    isLoading,
    error
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};
