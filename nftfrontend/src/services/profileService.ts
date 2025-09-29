import { toast } from 'sonner';
import { apiUrl } from '../config';

export const createOrUpdateProfile = async (address: string) => {
  try {
    // First try to get the profile
    const response = await fetch(apiUrl(`/profiles/${address}/`));
    
    if (!response.ok && response.status !== 404) {
      throw new Error('Failed to check profile existence');
    }
    
    // If profile doesn't exist or we need to update it
    const updateResponse = await fetch(apiUrl(`/profiles/${address}/update/`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: address,
      })
    });

    if (!updateResponse.ok) {
      throw new Error('Failed to update profile');
    }

    const data = await updateResponse.json();
    return data.success;
  } catch (error) {
    console.error('Error creating/updating profile:', error);
    toast.error('Failed to initialize profile');
    return false;
  }
};

export const followUser = async (targetAddress: string, followerAddress: string) => {
  try {
    const response = await fetch(apiUrl(`/profiles/${targetAddress}/follow/`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        follower_address: followerAddress,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to follow user');
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error following user:', error);
    throw error;
  }
};

export const unfollowUser = async (targetAddress: string, followerAddress: string) => {
  try {
    const response = await fetch(apiUrl(`/profiles/${targetAddress}/unfollow/`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        follower_address: followerAddress,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to unfollow user');
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error unfollowing user:', error);
    throw error;
  }
};

export const getFollowers = async (address: string) => {
  try {
    const response = await fetch(apiUrl(`/profiles/${address}/followers/`));
    if (!response.ok) {
      throw new Error('Failed to fetch followers');
    }
    const data = await response.json();
    return data.followers;
  } catch (error) {
    console.error('Error fetching followers:', error);
    throw error;
  }
};

export const getFollowing = async (address: string) => {
  try {
    const response = await fetch(apiUrl(`/profiles/${address}/following/`));
    if (!response.ok) {
      throw new Error('Failed to fetch following');
    }
    const data = await response.json();
    return data.following;
  } catch (error) {
    console.error('Error fetching following:', error);
    throw error;
  }
};
