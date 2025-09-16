import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useWallet } from './WalletContext';
import { nftService } from '@/services/nftService';

interface LikedNFTsContextType {
  likedNFTIds: Set<string>;
  refreshLikedNFTs: () => Promise<void>;
  setLikedNFTIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const LikedNFTsContext = createContext<LikedNFTsContextType | undefined>(undefined);

export const LikedNFTsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address } = useWallet();
  const [likedNFTIds, setLikedNFTIds] = useState<Set<string>>(new Set());

  const refreshLikedNFTs = useCallback(async () => {
    if (!address) return;
    try {
      console.log('[LikedNFTsContext] Refreshing liked NFTs for address:', address);
      const likedNFTs = await nftService.getUserLikedNFTs(address);
      const likedIds = new Set(likedNFTs.map((nft: any) => String(nft.id)));
      console.log('[LikedNFTsContext] Setting liked NFT IDs:', Array.from(likedIds));
      setLikedNFTIds(likedIds);
    } catch (e) {
      console.error('[LikedNFTsContext] Error refreshing liked NFTs:', e);
      setLikedNFTIds(new Set());
    }
  }, [address]);

  useEffect(() => {
    refreshLikedNFTs();
  }, [address, refreshLikedNFTs]);

  return (
    <LikedNFTsContext.Provider value={{ likedNFTIds, refreshLikedNFTs, setLikedNFTIds }}>
      {children}
    </LikedNFTsContext.Provider>
  );
};

export const useLikedNFTs = () => {
  const context = useContext(LikedNFTsContext);
  if (!context) {
    throw new Error('useLikedNFTs must be used within a LikedNFTsProvider');
  }
  
  // Debug log when context is used
  console.log('[LikedNFTsContext] Context used, liked IDs:', Array.from(context.likedNFTIds));
  
  return context;
};
