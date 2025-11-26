import { apiService, Activity, ActivityStats } from './api';

export interface ActivityFilters {
  type?: 'all' | 'mint' | 'list' | 'buy' | 'bid' | 'transfer' | 'delist';
  time_filter?: '1h' | '24h' | '7d' | '30d';
  search?: string;
  page?: number;
  limit?: number;
}

class ActivityService {
  async getActivities(filters: ActivityFilters = {}) {
    try {
      const response = await apiService.getActivities(filters);
      console.log('Fetched activities:', response);
      return response;
    } catch (error) {
      console.error('Error fetching activities:', error);
      return {
        success: false,
        data: [],
        pagination: {
          page: 1,
          total_pages: 1,
          total_items: 0,
          has_next: false,
          has_previous: false,
        }
      };
    }
  }

  async getActivityStats() {
    try {
      const response = await apiService.getActivityStats();
      return response;
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      return {
        success: false,
        data: {
          last_24h: { total: 0, sales: 0, listings: 0, mints: 0, transfers: 0, offers: 0 },
          last_7d: { total: 0, sales: 0, listings: 0, mints: 0, transfers: 0, offers: 0 },
          last_30d: { total: 0, sales: 0, listings: 0, mints: 0, transfers: 0, offers: 0 }
        }
      };
    }
  }

  async getNotifications(walletAddress: string, page = 1, limit = 20) {
    try {
      const response = await apiService.getNotifications(walletAddress, page, limit);
      return response;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return {
        success: false,
        data: [],
        pagination: {
          page: 1,
          total_pages: 1,
          total_items: 0,
          has_next: false,
          has_previous: false,
        }
      };
    }
  }

  getActivityBadge(type: string) {
    const badges = {
      sale: { label: 'Sale', variant: 'default' as const },
      buy: { label: 'Sale', variant: 'default' as const },
      list: { label: 'List', variant: 'secondary' as const },
      bid: { label: 'Offer', variant: 'outline' as const },
      transfer: { label: 'Transfer', variant: 'secondary' as const },
      mint: { label: 'Mint', variant: 'default' as const },
      delist: { label: 'Delist', variant: 'destructive' as const }
    };
    return badges[type as keyof typeof badges] || badges.sale;
  }

  formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffInMs = now.getTime() - activityTime.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInDays > 0) {
      return `${diffInDays} days ago`;
    } else if (diffInHours > 0) {
      return `${diffInHours} hours ago`;
    } else {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return `${diffInMinutes} minutes ago`;
    }
  }
}

export const activityService = new ActivityService(); 