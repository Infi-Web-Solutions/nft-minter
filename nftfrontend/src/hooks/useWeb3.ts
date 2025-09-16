import { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { web3Service, NFTMetadata, Listing } from '@/services/web3Service';
import { ethers } from 'ethers';

export const useWeb3 = () => {
  const { isConnected, address } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTransaction = useCallback(async <T>(
    transactionFn: () => Promise<T>
  ): Promise<T | null> => {
    if (!isConnected) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await transactionFn();
      return result;
    } catch (err: any) {
      const errorMessage = web3Service.formatError(err);
      setError(errorMessage);
      console.error('Transaction error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected]);

  // Mint NFT
  const mintNFT = useCallback(async (
    name: string,
    description: string,
    imageURI: string,
    category: string,
    royaltyPercentage: number,
    collectionName: string
  ) => {
    return handleTransaction(async () => {
      const tx = await web3Service.mintNFT(
        name,
        description,
        imageURI,
        category,
        royaltyPercentage,
        collectionName
      );
      
      const receipt = await web3Service.waitForTransaction(tx);
      return receipt;
    });
  }, [handleTransaction]);

  // List NFT
  const listNFT = useCallback(async (
    tokenId: number,
    price: string,
    isAuction: boolean = false,
    auctionDuration: number = 0
  ) => {
    return handleTransaction(async () => {
      const tx = await web3Service.listNFT(tokenId, price, isAuction, auctionDuration);
      const receipt = await web3Service.waitForTransaction(tx);
      return receipt;
    });
  }, [handleTransaction]);

  // Buy NFT
  const buyNFT = useCallback(async (tokenId: number, price: string) => {
    return handleTransaction(async () => {
      const tx = await web3Service.buyNFT(tokenId, price);
      const receipt = await web3Service.waitForTransaction(tx);
      return receipt;
    });
  }, [handleTransaction]);

  // Place bid
  const placeBid = useCallback(async (tokenId: number, bidAmount: string) => {
    return handleTransaction(async () => {
      const tx = await web3Service.placeBid(tokenId, bidAmount);
      const receipt = await web3Service.waitForTransaction(tx);
      return receipt;
    });
  }, [handleTransaction]);

  // End auction
  const endAuction = useCallback(async (tokenId: number) => {
    return handleTransaction(async () => {
      const tx = await web3Service.endAuction(tokenId);
      const receipt = await web3Service.waitForTransaction(tx);
      return receipt;
    });
  }, [handleTransaction]);

  // Delist NFT
  const delistNFT = useCallback(async (tokenId: number) => {
    return handleTransaction(async () => {
      const tx = await web3Service.delistNFT(tokenId);
      const receipt = await web3Service.waitForTransaction(tx);
      return receipt;
    });
  }, [handleTransaction]);

  // Get NFT metadata
  const getNFTMetadata = useCallback(async (tokenId: number): Promise<NFTMetadata | null> => {
    if (!isConnected) {
      setError('Wallet not connected');
      return null;
    }

    try {
      return await web3Service.getNFTMetadata(tokenId);
    } catch (err: any) {
      setError(web3Service.formatError(err));
      return null;
    }
  }, [isConnected]);

  // Get listing
  const getListing = useCallback(async (tokenId: number): Promise<Listing | null> => {
    if (!isConnected) {
      setError('Wallet not connected');
      return null;
    }

    try {
      return await web3Service.getListing(tokenId);
    } catch (err: any) {
      setError(web3Service.formatError(err));
      return null;
    }
  }, [isConnected]);

  // Get user NFTs
  const getUserNFTs = useCallback(async (): Promise<number[]> => {
    if (!isConnected || !address) {
      setError('Wallet not connected');
      return [];
    }

    try {
      return await web3Service.getUserNFTs(address);
    } catch (err: any) {
      setError(web3Service.formatError(err));
      return [];
    }
  }, [isConnected, address]);

  // Get user listings
  const getUserListings = useCallback(async (): Promise<number[]> => {
    if (!isConnected || !address) {
      setError('Wallet not connected');
      return [];
    }

    try {
      return await web3Service.getUserListings(address);
    } catch (err: any) {
      setError(web3Service.formatError(err));
      return [];
    }
  }, [isConnected, address]);

  // Get contract info
  const getContractInfo = useCallback(async () => {
    if (!isConnected) {
      setError('Wallet not connected');
      return null;
    }

    try {
      return await web3Service.getContractInfo();
    } catch (err: any) {
      setError(web3Service.formatError(err));
      return null;
    }
  }, [isConnected]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    isLoading,
    error,
    
    // Actions
    mintNFT,
    listNFT,
    buyNFT,
    placeBid,
    endAuction,
    delistNFT,
    
    // Queries
    getNFTMetadata,
    getListing,
    getUserNFTs,
    getUserListings,
    getContractInfo,
    
    // Utilities
    clearError,
    isConnected
  };
}; 