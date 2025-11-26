import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useWallet } from './WalletContext';
import { nftService } from '@/services/nftService';

interface LikedNFTsContextType {
  likedNFTIds: Set<string>;
  refreshLikedNFTs: () => Promise<void>;
  setLikedNFTIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleLike: (nftId: string, liked: boolean) => void;
}

const LikedNFTsContext = createContext<LikedNFTsContextType | undefined>(undefined);

export const LikedNFTsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address } = useWallet();
  const [likedNFTIds, setLikedNFTIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('likedNFTIds');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

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

  // Persist likedNFTIds to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('likedNFTIds', JSON.stringify(Array.from(likedNFTIds)));
    } catch (e) {
      console.error('[LikedNFTsContext] Error saving to localStorage:', e);
    }
  }, [likedNFTIds]);

  useEffect(() => {
    refreshLikedNFTs();
  }, [address, refreshLikedNFTs]);

  // ✅ Define toggleLike (optimistic update)
  const toggleLike = (nftId: string, liked: boolean) => {
    setLikedNFTIds(prev => {
      const updated = new Set(prev);
      if (liked) {
        updated.add(String(nftId));
      } else {
        updated.delete(String(nftId));
      }
      console.log('[LikedNFTsContext] Optimistic update:', Array.from(updated));
      return updated;
    });
  };

  return (
    <LikedNFTsContext.Provider value={{ likedNFTIds, refreshLikedNFTs, setLikedNFTIds, toggleLike }}>
      {children}
    </LikedNFTsContext.Provider>
  );
};

export const useLikedNFTs = () => {
  const context = useContext(LikedNFTsContext);
  if (!context) {
    throw new Error('useLikedNFTs must be used within a LikedNFTsProvider');
  }

  console.log('[LikedNFTsContext] Context used, liked IDs:', Array.from(context.likedNFTIds));
  return context;
};
