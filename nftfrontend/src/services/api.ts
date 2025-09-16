const API_BASE_URL = 'http://localhost:8000/api';

export interface NFT {
  id: number;
  token_id: number;
  name: string;
  description: string;
  image_url: string;
  price: number | null;
  is_listed: boolean;
  is_auction: boolean;
  auction_end_time: string | null;
  current_bid: number | null;
  highest_bidder: string | null;
  owner_address: string;
  creator_address: string;
  collection: string | null;
  category: string | null;
  created_at: string;
}

export interface Collection {
  id: number;
  name: string;
  description: string;
  creator_address: string;
  image_url: string | null;
  banner_url: string | null;
  floor_price: number | null;
  total_volume: number;
  total_items: number;
  created_at: string;
}

export interface UserProfile {
  id: number;
  username: string;
  wallet_address: string;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  discord: string | null;
  total_created: number;
  total_collected: number;
  total_volume: number;
  created_at: string;
  nfts_owned: number;
  nfts_created: number;
}

export interface ContractInfo {
  name: string;
  symbol: string;
  address: string;
  network: string;
}

export interface Activity {
  id: number;
  type: 'mint' | 'list' | 'buy' | 'bid' | 'transfer' | 'delist';
  nft: {
    id: number;
    name: string;
    image_url: string;
    collection: string;
    token_id: number;
  };
  from: {
    address: string;
    name: string;
    avatar: string;
  };
  to: {
    address: string;
    name: string;
    avatar: string;
  };
  price: number | null;
  timestamp: string;
  time_ago: string;
  transaction_hash: string;
  block_number: number;
  gas_used: number;
  gas_price: number | null;
}

export interface ActivityStats {
  last_24h: {
    total: number;
    sales: number;
    listings: number;
    mints: number;
    transfers: number;
    offers: number;
  };
  last_7d: {
    total: number;
    sales: number;
    listings: number;
    mints: number;
    transfers: number;
    offers: number;
  };
  last_30d: {
    total: number;
    sales: number;
    listings: number;
    mints: number;
    transfers: number;
    offers: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    total_pages: number;
    total_items: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[ApiService] Making request to: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    console.log(`[ApiService] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ApiService] HTTP error: ${response.status} - ${errorText}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[ApiService] Response data:`, data);
    return data;
  }

  // NFT endpoints
  async getNFTs(params: {
    page?: number;
    limit?: number;
    category?: string;
    collection?: string;
    price_min?: number;
    price_max?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  } = {}): Promise<PaginatedResponse<NFT>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    return this.request<PaginatedResponse<NFT>>(`/nfts/?${searchParams.toString()}`);
  }

  async getNFTDetail(tokenId: number): Promise<ApiResponse<NFT>> {
    return this.request<ApiResponse<NFT>>(`/nfts/${tokenId}/`);
  }

  async searchNFTs(query: string): Promise<ApiResponse<NFT[]>> {
    return this.request<ApiResponse<NFT[]>>(`/nfts/search/?q=${encodeURIComponent(query)}`);
  }

  // Collection endpoints
  async getCollections(): Promise<ApiResponse<Collection[]>> {
    return this.request<ApiResponse<Collection[]>>('/collections/');
  }

  async getTrendingCollections(): Promise<ApiResponse<Collection[]>> {
    return this.request<ApiResponse<Collection[]>>('/collections/trending/');
  }

  async getCollectionsByLikes(): Promise<ApiResponse<(Collection & { total_likes: number })[]>> {
    return this.request<ApiResponse<(Collection & { total_likes: number })[]>>('/collections/by-likes/');
  }

  // User endpoints
  async getUserProfile(walletAddress: string): Promise<ApiResponse<UserProfile>> {
    return this.request<ApiResponse<UserProfile>>(`/users/${walletAddress}/`);
  }

  async getUserNFTs(walletAddress: string): Promise<ApiResponse<NFT[]>> {
    return this.request<ApiResponse<NFT[]>>(`/users/${walletAddress}/nfts/`);
  }

  // Contract endpoints
  async getContractInfo(): Promise<ApiResponse<ContractInfo>> {
    return this.request<ApiResponse<ContractInfo>>('/contract/info/');
  }



  // Activity endpoints
  async getActivities(params: {
    page?: number;
    limit?: number;
    type?: 'all' | 'mint' | 'list' | 'buy' | 'bid' | 'transfer' | 'delist';
    time_filter?: '1h' | '24h' | '7d' | '30d';
    search?: string;
  } = {}): Promise<PaginatedResponse<Activity>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== 'all') {
        searchParams.append(key, value.toString());
      }
    });

    return this.request<PaginatedResponse<Activity>>(`/activities/?${searchParams.toString()}`);
  }

  async getActivityStats(): Promise<ApiResponse<ActivityStats>> {
    return this.request<ApiResponse<ActivityStats>>('/activities/stats/');
  }
}

export const apiService = new ApiService(); 