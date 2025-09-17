export interface NFT {
  id: string | number;
  title?: string;
  name: string;
  collection: string | { name: string; slug?: string; image_url?: string };
  price: string | number;
  current_price?: string | number; // Added for OpenSea assets
  image: string;
  image_url: string;
  token_id?: string | number;
  description?: string;
  liked?: boolean;
  isAuction?: boolean;
  timeLeft?: string;
  views?: number;
  category?: string;
  status?: string;
  blockchain?: string;
  createdAt?: string;
  source?: 'local' | 'opensea';
  owner_address?: string;
  creator_address?: string;
  is_listed?: boolean;
  is_auction?: boolean;
  sell_orders?: Array<{ current_price: string | number }>;
}

export interface NFTResponse {
  success: boolean;
  data: NFT[];
  stats?: {
    local_count: number;
    opensea_count: number;
    total_count: number;
  };
  error?: string;
}

import { apiUrl } from '../config';

class NFTService {
  private baseUrl = apiUrl('');

  async getCombinedNFTs(userAddress?: string): Promise<NFT[]> {
    try {
      const url = userAddress 
        ? apiUrl(`/nfts/combined/?user_address=${userAddress}`)
        : apiUrl('/nfts/combined/');
      
      const response = await fetch(url);
      const data: NFTResponse = await response.json();
      
      if (data.success) {
        console.log('[nftService] getCombinedNFTs received data:', data.data);
        console.log('[nftService] First NFT ID:', data.data[0]?.id, 'Type:', typeof data.data[0]?.id);
        console.log('[nftService] All NFT IDs:', data.data.map(nft => ({ id: nft.id, type: typeof nft.id, source: nft.source })));
        return data.data;
      } else {
        console.error('Failed to fetch NFTs:', data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching combined NFTs:', error);
      return [];
    }
  }

  async getUserCreatedNFTs(walletAddress: string): Promise<NFT[]> {
    try {
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/created/`));
      const data = await response.json();
      
      if (data.success) {
        return data.nfts || [];
      } else {
        console.error('Failed to fetch user created NFTs:', data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching user created NFTs:', error);
      return [];
    }
  }

  async getUserCollectedNFTs(walletAddress: string): Promise<NFT[]> {
    try {
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/nfts/`));
      const data = await response.json();
      
      if (data.success) {
        return data.nfts || [];
      } else {
        console.error('Failed to fetch user collected NFTs:', data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching user collected NFTs:', error);
      return [];
    }
  }

  async toggleNFTLike(nftId: string | number, userAddress: string): Promise<{ success: boolean; liked?: boolean; like_count?: number; error?: string }> {
    try {
      console.log('[nftService] toggleNFTLike called with:', { nftId, nftId_type: typeof nftId, userAddress });
      // Pass the full combined ID (local_1, local_2, etc.) to the backend
      const response = await fetch(apiUrl(`/nfts/${nftId}/toggle-like/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_address: userAddress }),
      });
      
      const data = await response.json();
      return { success: data.success, liked: data.liked, like_count: data.like_count, error: data.error };
    } catch (error) {
      console.error('Error toggling NFT like:', error);
      return { success: false, error: 'Network error occurred' };
    }
  }

  async updateNFTOwner(tokenId: string | number, userAddress: string): Promise<boolean> {
    try {
      const response = await fetch(apiUrl(`/nfts/${tokenId}/transfer/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_owner: userAddress }),
      });
      
      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error updating NFT owner:', error);
      return false;
    }
  }

  async getUserLikedNFTs(userAddress: string): Promise<NFT[]> {
    try {
      console.log('[nftService] getUserLikedNFTs called for:', userAddress);
      const response = await fetch(apiUrl(`/profiles/${userAddress}/liked/`));
      const data = await response.json();
      
      if (data.success) {
        console.log('[nftService] getUserLikedNFTs received:', data.data.length, 'NFTs');
        return data.data || [];
      } else {
        console.error('Failed to fetch user liked NFTs:', data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching user liked NFTs:', error);
      return [];
    }
  }
}

export const nftService = new NFTService(); 