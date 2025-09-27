import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/config';
import { useWallet } from './WalletContext';

interface FollowContextType {
  following: Set<string>;
  isFollowing: (address: string) => boolean;
  toggleFollow: (address: string) => Promise<void>;
  syncFollowing: () => Promise<void>;
}

const FollowContext = createContext<FollowContextType | null>(null);

export function useFollow() {
  const context = useContext(FollowContext);
  if (!context) {
    throw new Error('useFollow must be used within a FollowProvider');
  }
  return context;
}

export function FollowProvider({ children }: { children: React.ReactNode }) {
  const { address } = useWallet();
  
  // Initialize following state from localStorage if available
  const [following, setFollowing] = useState<Set<string>>(() => {
    if (!address) return new Set();
    try {
      const cached = localStorage.getItem(`following_${address.toLowerCase()}`);
      if (cached) {
        const addresses = JSON.parse(cached);
        return new Set(addresses.map((addr: string) => addr.toLowerCase()));
      }
    } catch (error) {
      console.warn('[FollowContext] Failed to load cached following list:', error);
    }
    return new Set();
  });
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Sync following list when wallet connects/disconnects
  useEffect(() => {
    if (address) {
      const loadFollowing = async () => {
        try {
          await syncFollowing();
        } catch (error) {
          if (retryCount < maxRetries) {
            console.log(`[FollowContext] Retrying sync (${retryCount + 1}/${maxRetries})...`);
            setRetryCount(prev => prev + 1);
            // Retry after a delay
            setTimeout(loadFollowing, 1000 * (retryCount + 1));
          }
        }
      };

      loadFollowing();
    } else {
      setFollowing(new Set());
      setRetryCount(0);
    }
  }, [address, retryCount]);

  const syncFollowing = async () => {
    if (!address) return;

    try {
      const response = await fetch(apiUrl(`/profiles/${address}/following/`));
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to sync following');
      }

      // The backend returns an array of objects with wallet_address
      const followingAddresses = data.following.map((profile: { wallet_address: string }) => 
        profile.wallet_address.toLowerCase()
      );
      
      setFollowing(new Set(followingAddresses));
      setRetryCount(0); // Reset retry count on success
      console.log('[FollowContext] Synced following list:', followingAddresses);
      
      // Save to localStorage for persistence
      try {
        localStorage.setItem(
          `following_${address.toLowerCase()}`, 
          JSON.stringify(Array.from(followingAddresses))
        );
      } catch (error) {
        console.warn('[FollowContext] Failed to cache following list:', error);
      }
    } catch (error) {
      console.error('[FollowContext] Failed to sync following list:', error);
      throw error; // Re-throw for retry mechanism
    }
  };

  const isFollowing = (targetAddress: string) => {
    if (!targetAddress) return false;
    return following.has(targetAddress.toLowerCase());
  };

  const toggleFollow = async (targetAddress: string) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    const isCurrentlyFollowing = following.has(targetAddress.toLowerCase());
    const endpoint = isCurrentlyFollowing ? 'unfollow' : 'follow';

    try {
      const response = await fetch(apiUrl(`/profiles/${targetAddress}/${endpoint}/`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          follower_address: address,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If already following/not following, just update the UI state
        if (data.error === 'Already following this user') {
          if (!following.has(targetAddress.toLowerCase())) {
            const newFollowing = new Set(following);
            newFollowing.add(targetAddress.toLowerCase());
            setFollowing(newFollowing);
          }
          return;
        }
        if (data.error === 'Not following this user') {
          if (following.has(targetAddress.toLowerCase())) {
            const newFollowing = new Set(following);
            newFollowing.delete(targetAddress.toLowerCase());
            setFollowing(newFollowing);
          }
          return;
        }
        throw new Error(data.error || 'Failed to update follow status');
      }

      if (data.success) {
        const newFollowing = new Set(following);
        if (!isCurrentlyFollowing) {
          newFollowing.add(targetAddress.toLowerCase());
          toast.success('Started following');
        } else {
          newFollowing.delete(targetAddress.toLowerCase());
          toast.success('Unfollowed');
        }
        setFollowing(newFollowing);
      } else {
        toast.error(data.error || 'Failed to update follow status');
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status');
    }
  };

  return (
    <FollowContext.Provider value={{ following, isFollowing, toggleFollow, syncFollowing }}>
      {children}
    </FollowContext.Provider>
  );
}