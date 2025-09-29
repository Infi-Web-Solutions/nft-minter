import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from './WalletContext';
import { nftService } from '@/services/nftService';

interface LikeContextType {
  likedNFTs: Set<string>;
  toggleLike: (nftId: string | number) => Promise<void>;
  isLiked: (nftId: string | number) => boolean;
  syncLikes: () => Promise<void>;
}

const LikeContext = createContext<LikeContextType | null>(null);

export const useLikes = () => {
  const context = useContext(LikeContext);
  if (!context) {
    throw new Error('useLikes must be used within a LikeProvider');
  }
  return context;
};

export const LikeProvider = ({ children }: { children: React.ReactNode }) => {
  const [likedNFTs, setLikedNFTs] = useState<Set<string>>(new Set());
  const { address } = useWallet();

  const syncLikes = useCallback(async () => {
    if (!address) {
      setLikedNFTs(new Set());
      return;
    }

    try {
      const likedNFTsList = await nftService.getUserLikedNFTs(address);
      const likedIds = likedNFTsList.map(nft => nft.id.toString());
      setLikedNFTs(new Set(likedIds));
    } catch (error) {
      console.error('Failed to sync likes:', error);
      setLikedNFTs(new Set());
    }
  }, [address]);

  useEffect(() => {
    syncLikes();
  }, [syncLikes]);

  const toggleLike = async (nftId: string | number) => {
    if (!address || !nftId) return;

    const id = nftId.toString();
    const currentLiked = new Set(likedNFTs);
    const wasLiked = currentLiked.has(id);

    try {
      // Optimistically update
      if (wasLiked) {
        currentLiked.delete(id);
      } else {
        currentLiked.add(id);
      }
      setLikedNFTs(currentLiked);

      // Update backend with combined ID (string allowed, e.g., "local_12")
      await nftService.toggleNFTLike(id, address);
      
      // Re-sync to ensure consistency
      await syncLikes();
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert on failure
      setLikedNFTs(new Set(Array.from(likedNFTs)));
    }
  };

  const isLiked = useCallback((nftId: string | number): boolean => {
    return likedNFTs.has(nftId.toString());
  }, [likedNFTs]);

  const value = useMemo(() => ({
    likedNFTs,
    toggleLike,
    isLiked,
    syncLikes
  }), [likedNFTs, isLiked, syncLikes]);

  return (
    <LikeContext.Provider value={value}>
      {children}
    </LikeContext.Provider>
  );
};