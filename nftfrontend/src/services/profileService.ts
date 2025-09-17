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
