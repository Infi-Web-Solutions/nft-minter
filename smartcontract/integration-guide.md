# Frontend-Smart Contract Integration Guide

This guide explains how to integrate the NFT Marketplace smart contract with your React frontend.

## Prerequisites

1. Deployed smart contract address
2. Contract ABI (from compilation)
3. Web3 provider (MetaMask or similar)

## Step 1: Install Dependencies

In your frontend project (`nftfrontend/`):

```bash
npm install ethers@6.8.1 @web3-react/core @web3-react/injected-connector
```

## Step 2: Create Contract Service

Create a new file `src/services/contractService.ts`:

```typescript
import { ethers } from 'ethers';
import NFTMarketplaceABI from '../contracts/NFTMarketplace.json';

export class ContractService {
  private contract: ethers.Contract;
  private provider: ethers.BrowserProvider;
  private signer: ethers.JsonRpcSigner;

  constructor(contractAddress: string) {
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = this.provider.getSigner();
    this.contract = new ethers.Contract(contractAddress, NFTMarketplaceABI.abi, this.signer);
  }

  // Get contract instance
  getContract() {
    return this.contract;
  }

  // Get provider
  getProvider() {
    return this.provider;
  }

  // Get signer
  getSigner() {
    return this.signer;
  }

  // Mint NFT
  async mintNFT(
    name: string,
    description: string,
    imageURI: string,
    category: string,
    royaltyPercentage: number,
    collectionName: string
  ) {
    try {
      const tx = await this.contract.mintNFT(
        name,
        description,
        imageURI,
        category,
        royaltyPercentage,
        collectionName
      );
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error minting NFT:', error);
      throw error;
    }
  }

  // List NFT for sale
  async listNFT(
    tokenId: number,
    price: string,
    isAuction: boolean,
    auctionDuration: number = 0
  ) {
    try {
      const priceInWei = ethers.parseEther(price);
      const tx = await this.contract.listNFT(tokenId, priceInWei, isAuction, auctionDuration);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error listing NFT:', error);
      throw error;
    }
  }

  // Buy NFT
  async buyNFT(tokenId: number, price: string) {
    try {
      const priceInWei = ethers.parseEther(price);
      const tx = await this.contract.buyNFT(tokenId, { value: priceInWei });
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error buying NFT:', error);
      throw error;
    }
  }

  // Place bid on auction
  async placeBid(tokenId: number, bidAmount: string) {
    try {
      const amountInWei = ethers.parseEther(bidAmount);
      const tx = await this.contract.placeBid(tokenId, { value: amountInWei });
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error placing bid:', error);
      throw error;
    }
  }

  // End auction
  async endAuction(tokenId: number) {
    try {
      const tx = await this.contract.endAuction(tokenId);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error ending auction:', error);
      throw error;
    }
  }

  // Delist NFT
  async delistNFT(tokenId: number) {
    try {
      const tx = await this.contract.delistNFT(tokenId);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error('Error delisting NFT:', error);
      throw error;
    }
  }

  // Get user's NFTs
  async getUserNFTs(address: string) {
    try {
      const tokenIds = await this.contract.getUserNFTs(address);
      return tokenIds;
    } catch (error) {
      console.error('Error getting user NFTs:', error);
      throw error;
    }
  }

  // Get user's listings
  async getUserListings(address: string) {
    try {
      const tokenIds = await this.contract.getUserListings(address);
      return tokenIds;
    } catch (error) {
      console.error('Error getting user listings:', error);
      throw error;
    }
  }

  // Get NFT metadata
  async getNFTMetadata(tokenId: number) {
    try {
      const metadata = await this.contract.getNFTMetadata(tokenId);
      return metadata;
    } catch (error) {
      console.error('Error getting NFT metadata:', error);
      throw error;
    }
  }

  // Get collection
  async getCollection(collectionName: string) {
    try {
      const collection = await this.contract.getCollection(collectionName);
      return collection;
    } catch (error) {
      console.error('Error getting collection:', error);
      throw error;
    }
  }

  // Get listing
  async getListing(tokenId: number) {
    try {
      const listing = await this.contract.getListing(tokenId);
      return listing;
    } catch (error) {
      console.error('Error getting listing:', error);
      throw error;
    }
  }
}
```

## Step 3: Update Wallet Context

Update `src/contexts/WalletContext.tsx` to include contract integration:

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ContractService } from '../services/contractService';

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnecting: boolean;
  contractService: ContractService | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: React.ReactNode;
}

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [contractService, setContractService] = useState<ContractService | null>(null);

  // Contract address - update this with your deployed contract address
  const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || 'YOUR_CONTRACT_ADDRESS';

  // Check if wallet was previously connected
  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress');
    const savedConnection = localStorage.getItem('walletConnected');
    
    if (savedAddress && savedConnection === 'true') {
      setAddress(savedAddress);
      setIsConnected(true);
      initializeContractService(savedAddress);
    }
  }, []);

  const initializeContractService = (userAddress: string) => {
    try {
      const service = new ContractService(CONTRACT_ADDRESS);
      setContractService(service);
    } catch (error) {
      console.error('Error initializing contract service:', error);
    }
  };

  const connectWallet = async () => {
    setIsConnecting(true);
    
    try {
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userAddress = accounts[0];
      
      setAddress(userAddress);
      setIsConnected(true);
      initializeContractService(userAddress);
      
      // Save to localStorage
      localStorage.setItem('walletAddress', userAddress);
      localStorage.setItem('walletConnected', 'true');
      
      console.log('Wallet connected:', userAddress);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAddress(null);
    setIsConnected(false);
    setContractService(null);
    
    // Clear localStorage
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('walletConnected');
    
    console.log('Wallet disconnected');
  };

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address,
        connectWallet,
        disconnectWallet,
        isConnecting,
        contractService,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
```

## Step 4: Update Create Page

Update `src/pages/Create.tsx` to integrate with the smart contract:

```typescript
import React, { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { ethers } from 'ethers';

const Create = () => {
  const { contractService, address } = useWallet();
  const [isMinting, setIsMinting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    imageURI: '',
    category: 'art',
    royaltyPercentage: 5,
    collectionName: '',
    price: '',
    isAuction: false,
    auctionDuration: 3600
  });

  const handleMintNFT = async () => {
    if (!contractService || !address) {
      alert('Please connect your wallet first');
      return;
    }

    if (!formData.name || !formData.imageURI) {
      alert('Please fill in all required fields');
      return;
    }

    setIsMinting(true);
    try {
      const receipt = await contractService.mintNFT(
        formData.name,
        formData.description,
        formData.imageURI,
        formData.category,
        formData.royaltyPercentage,
        formData.collectionName
      );

      console.log('NFT minted successfully!', receipt);
      alert('NFT minted successfully!');

      // If user wants to list immediately
      if (formData.price) {
        const tokenId = receipt.logs[0].args.tokenId;
        await contractService.listNFT(
          tokenId,
          formData.price,
          formData.isAuction,
          formData.auctionDuration
        );
        alert('NFT listed for sale!');
      }
    } catch (error) {
      console.error('Error minting NFT:', error);
      alert('Error minting NFT. Please try again.');
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ... existing JSX ... */}
      
      <div className="pt-6">
        <Button 
          size="lg" 
          className="w-full bg-gradient-to-r from-purple-500 to-blue-600"
          onClick={handleMintNFT}
          disabled={isMinting}
        >
          {isMinting ? 'Creating NFT...' : 'Create NFT'}
        </Button>
      </div>
    </div>
  );
};
```

## Step 5: Update Marketplace Page

Update `src/pages/Marketplace.tsx` to fetch real data from the contract:

```typescript
import React, { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';

const Marketplace = () => {
  const { contractService, address } = useWallet();
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contractService) {
      loadNFTs();
    }
  }, [contractService]);

  const loadNFTs = async () => {
    try {
      setLoading(true);
      // This is a simplified example - you'll need to implement
      // a way to get all listed NFTs from your contract
      const allListings = await getAllListings();
      setNfts(allListings);
    } catch (error) {
      console.error('Error loading NFTs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyNFT = async (tokenId: number, price: string) => {
    if (!contractService || !address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      await contractService.buyNFT(tokenId, price);
      alert('NFT purchased successfully!');
      loadNFTs(); // Refresh the list
    } catch (error) {
      console.error('Error buying NFT:', error);
      alert('Error buying NFT. Please try again.');
    }
  };

  const handlePlaceBid = async (tokenId: number, bidAmount: string) => {
    if (!contractService || !address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      await contractService.placeBid(tokenId, bidAmount);
      alert('Bid placed successfully!');
      loadNFTs(); // Refresh the list
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Error placing bid. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ... existing JSX ... */}
      
      {loading ? (
        <div className="text-center py-16">
          <p>Loading NFTs...</p>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {nfts.map((nft) => (
            <NFTCard
              key={nft.id}
              {...nft}
              onBuy={() => handleBuyNFT(nft.id, nft.price)}
              onBid={() => handlePlaceBid(nft.id, nft.price)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

## Step 6: Environment Variables

Create `.env` file in your frontend project:

```env
REACT_APP_CONTRACT_ADDRESS=your_deployed_contract_address_here
REACT_APP_NETWORK_ID=1
REACT_APP_RPC_URL=https://mainnet.infura.io/v3/your_project_id
```

## Step 7: Contract ABI

Copy the contract ABI from `smartcontract/artifacts/contracts/NFTMarketplace.sol/NFTMarketplace.json` to `src/contracts/NFTMarketplace.json` in your frontend project.

## Step 8: Error Handling

Add proper error handling for common scenarios:

```typescript
// Add to contractService.ts
export const handleContractError = (error: any) => {
  if (error.code === 4001) {
    return 'Transaction rejected by user';
  } else if (error.code === -32603) {
    return 'Network error. Please try again.';
  } else if (error.message.includes('insufficient funds')) {
    return 'Insufficient funds for transaction';
  } else if (error.message.includes('user rejected')) {
    return 'Transaction was rejected';
  } else {
    return 'An error occurred. Please try again.';
  }
};
```

## Step 9: Testing

1. Deploy the contract to a testnet
2. Update the contract address in your environment variables
3. Test all functions with small amounts
4. Verify transactions on the blockchain explorer

## Important Notes

1. **Gas Fees**: Always inform users about gas fees
2. **Error Handling**: Implement comprehensive error handling
3. **Loading States**: Show loading states during transactions
4. **Transaction Confirmation**: Wait for transaction confirmations
5. **Network Validation**: Ensure users are on the correct network
6. **Security**: Never expose private keys in the frontend

## Next Steps

1. Implement IPFS for metadata storage
2. Add image upload functionality
3. Implement real-time updates using events
4. Add transaction history
5. Implement advanced filtering and search
6. Add collection management features

This integration provides a solid foundation for connecting your React frontend to the NFT marketplace smart contract. 