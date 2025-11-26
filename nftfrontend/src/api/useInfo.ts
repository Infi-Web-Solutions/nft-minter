import { apiUrl } from '@/config';
import { toast } from 'sonner';

export interface ProfileData {
  id: string;
  username: string;
  bio: string;
  avatar_url: string;
  banner_url: string;
  wallet_address: string;
  website: string;
  twitter: string;
  instagram: string;
  discord: string;
  total_created: number;
  total_collected: number;
  total_volume: number;
  verified: boolean;
}

export interface ProfileUpdateData {
  username?: string;
  bio?: string;
  website?: string;
  twitter?: string;
  instagram?: string;
  discord?: string;
  profile_image?: string;
  cover_image?: string;
}

export interface SocialData {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

class ProfileService {
  /**
   * Fetch user profile by wallet address
   */
  async getProfile(walletAddress: string): Promise<ProfileData | null> {
    try {
      console.log(`[ProfileService] Fetching profile for wallet: ${walletAddress}`);
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/`));
      const data = await response.json();

      if (data.success) {
        return this.mapProfileData(data.data);
      } else {
        console.error(`[ProfileService] Profile not found:`, data.error);
        return null;
      }
    } catch (error) {
      console.error('[ProfileService] Failed to fetch profile:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    walletAddress: string,
    updateData: ProfileUpdateData
  ): Promise<ProfileData | null> {
    try {
      console.log(`[ProfileService] Updating profile for wallet: ${walletAddress}`);
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/update/`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Profile updated successfully');
        return this.mapProfileData(data.data);
      } else {
        toast.error(data.error || 'Failed to update profile');
        return null;
      }
    } catch (error) {
      console.error('[ProfileService] Failed to update profile:', error);
      toast.error('Failed to update profile');
      throw error;
    }
  }

  /**
   * Update profile image (avatar)
   */
  async updateProfileImage(
    walletAddress: string,
    base64Image: string
  ): Promise<ProfileData | null> {
    return this.updateProfile(walletAddress, { profile_image: base64Image });
  }

  /**
   * Update cover image (banner)
   */
  async updateCoverImage(
    walletAddress: string,
    base64Image: string
  ): Promise<ProfileData | null> {
    return this.updateProfile(walletAddress, { cover_image: base64Image });
  }

  /**
   * Get social data (followers, following)
   */
  async getSocialData(
    walletAddress: string,
    currentUserAddress?: string
  ): Promise<SocialData> {
    try {
      const [followersRes, followingRes] = await Promise.all([
        fetch(apiUrl(`/profiles/${walletAddress}/followers/`)),
        fetch(apiUrl(`/profiles/${walletAddress}/following/`)),
      ]);

      const [followersData, followingData] = await Promise.all([
        followersRes.json(),
        followingRes.json(),
      ]);

      let isFollowing = false;

      // Check if current user is following this profile
      if (currentUserAddress && currentUserAddress !== walletAddress && followersData.success) {
        isFollowing = followersData.followers?.some(
          (follower: any) =>
            follower.wallet_address.toLowerCase() === currentUserAddress.toLowerCase()
        ) || false;
      }

      return {
        followersCount: followersData.success ? followersData.count : 0,
        followingCount: followingData.success ? followingData.count : 0,
        isFollowing,
      };
    } catch (error) {
      console.error('[ProfileService] Failed to fetch social data:', error);
      return {
        followersCount: 0,
        followingCount: 0,
        isFollowing: false,
      };
    }
  }

  /**
   * Follow a user
   */
  async followUser(
    targetWalletAddress: string,
    followerAddress: string
  ): Promise<{ success: boolean; followersCount: number }> {
    try {
      const response = await fetch(apiUrl(`/profiles/${targetWalletAddress}/follow/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_address: followerAddress }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Followed successfully');
        return {
          success: true,
          followersCount: data.followers_count || 0,
        };
      } else {
        toast.error(data.error || 'Failed to follow user');
        return { success: false, followersCount: 0 };
      }
    } catch (error) {
      console.error('[ProfileService] Failed to follow user:', error);
      toast.error('Failed to follow user');
      return { success: false, followersCount: 0 };
    }
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(
    targetWalletAddress: string,
    followerAddress: string
  ): Promise<{ success: boolean; followersCount: number }> {
    try {
      const response = await fetch(apiUrl(`/profiles/${targetWalletAddress}/unfollow/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_address: followerAddress }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Unfollowed successfully');
        return {
          success: true,
          followersCount: data.followers_count || 0,
        };
      } else {
        toast.error(data.error || 'Failed to unfollow user');
        return { success: false, followersCount: 0 };
      }
    } catch (error) {
      console.error('[ProfileService] Failed to unfollow user:', error);
      toast.error('Failed to unfollow user');
      return { success: false, followersCount: 0 };
    }
  }

  /**
   * Toggle follow status
   */
  async toggleFollow(
    targetWalletAddress: string,
    followerAddress: string,
    isCurrentlyFollowing: boolean
  ): Promise<{ success: boolean; isFollowing: boolean; followersCount: number }> {
    const result = isCurrentlyFollowing
      ? await this.unfollowUser(targetWalletAddress, followerAddress)
      : await this.followUser(targetWalletAddress, followerAddress);

    return {
      ...result,
      isFollowing: !isCurrentlyFollowing,
    };
  }

  /**
   * Get user's collected NFTs
   */
  async getCollectedNFTs(walletAddress: string): Promise<any[]> {
    try {
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/nfts/`));
      const data = await response.json();

      if (data.success) {
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('[ProfileService] Failed to fetch collected NFTs:', error);
      return [];
    }
  }

  /**
   * Get user's created NFTs
   */
  async getCreatedNFTs(walletAddress: string): Promise<any[]> {
    try {
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/created/`));
      const data = await response.json();

      if (data.success) {
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('[ProfileService] Failed to fetch created NFTs:', error);
      return [];
    }
  }

  /**
   * Get user's liked NFTs
   */
  async getLikedNFTs(walletAddress: string): Promise<any[]> {
    try {
      const response = await fetch(apiUrl(`/profiles/${walletAddress}/liked/`));
      const data = await response.json();

      if (data.success) {
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('[ProfileService] Failed to fetch liked NFTs:', error);
      return [];
    }
  }

  /**
   * Convert file to base64 string
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  }

  /**
   * Map API response to ProfileData interface
   */
  private mapProfileData(apiData: any): ProfileData {
    console.log('[ProfileService] Mapping profile data:', apiData);
    
    return {
      id: apiData._id?.$oid || apiData.id || '',
      username: apiData.username || '',
      bio: apiData.bio || '',
      avatar_url: apiData.avatar_url || apiData.profile_image || '',
      banner_url: apiData.banner_url || apiData.cover_image || '',
      wallet_address: apiData.wallet_address || '',
      website: apiData.website || '',
      twitter: apiData.twitter || '',
      instagram: apiData.instagram || '',
      discord: apiData.discord || '',
      total_created: apiData.nfts_created || apiData.total_created || 0,
      total_collected: apiData.nfts_owned || apiData.total_collected || 0,
      total_volume: apiData.total_volume || 0,
      verified: apiData.verified || false,
    };
  }

  /**
   * Get display name for profile
   */
  getDisplayName(profile: ProfileData | null, walletAddress?: string): string {
    if (profile?.username) return profile.username;
    if (walletAddress) return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    return 'Unknown';
  }

  /**
   * Get profile image URL with fallback
   */
  getProfileImageUrl(profile: ProfileData | null): string {
    return profile?.avatar_url || '';
  }

  /**
   * Get banner image URL with fallback
   */
  getBannerImageUrl(profile: ProfileData | null): string {
    return profile?.banner_url || profile?.avatar_url || '';
  }
}

export const profileService = new ProfileService();