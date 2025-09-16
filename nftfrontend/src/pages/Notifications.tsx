
import React, { useEffect, useState } from 'react';
import { Check, X, Clock, Heart, ShoppingBag, UserPlus, UserMinus, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useWallet } from '@/contexts/WalletContext';
import { nftService, NFT } from '@/services/nftService';
import { activityService } from '@/services/activityService';

type NotificationType = 'like' | 'sale' | 'offer' | 'follow';
type NotificationItem = {
  id: string | number;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: any;
};

const Notifications = () => {
  const { address } = useWallet();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | NotificationType>('all');

  const timeAgo = (date: string | number | Date) => {
    const d = new Date(date).getTime();
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} minute${m>1?'s':''} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h>1?'s':''} ago`;
    const dday = Math.floor(h / 24);
    return `${dday} day${dday>1?'s':''} ago`;
  };

  useEffect(() => {
    const run = async () => {
      if (!address) return;
      const items: NotificationItem[] = [];

      // Likes: owner-only notifications for owned NFTs that have likes
      try {
        const nfts: NFT[] = await nftService.getCombinedNFTs(address);
        const owned = nfts.filter(n => (n.owner_address || '').toLowerCase() === address.toLowerCase());
        for (const n of owned) {
          const count = (n as any).like_count || 0;
          if (count > 0) {
            items.push({
              id: `like-${n.id}`,
              type: 'like',
              title: 'NFT liked',
              message: `${n.name || (n as any).title} received ${count} like${count>1?'s':''}`,
              time: timeAgo((n as any).updated_at || (n as any).created_at || new Date()),
              read: false,
              icon: Heart,
            });
          }
        }
      } catch {}

      // Sales: buy activities where seller is the current user
      try {
        const res = await activityService.getActivities({ type: 'buy', limit: 100 });
        if (res.success) {
          for (const a of res.data) {
            if ((a.from?.address || '').toLowerCase() === address.toLowerCase()) {
              items.push({
                id: `sale-${a.id}`,
                type: 'sale',
                title: 'Sale completed',
                message: `${a.nft.name} sold for Ξ ${a.price ?? 0}`,
                time: timeAgo(a.timestamp),
                read: false,
                icon: ShoppingBag,
              });
            }
          }
        }
      } catch {}

      // Offers: bid events where user is owner or bidder
      try {
        const res = await activityService.getActivities({ type: 'bid', limit: 100 });
        if (res.success) {
          for (const a of res.data) {
            const isOwner = (a.to?.address || '').toLowerCase() === address.toLowerCase();
            const isBidder = (a.from?.address || '').toLowerCase() === address.toLowerCase();
            if (isOwner || isBidder) {
              items.push({
                id: `offer-${a.id}`,
                type: 'offer',
                title: isOwner ? 'New offer on your NFT' : 'You placed an offer',
                message: isOwner ? `${a.from?.name || a.from?.address} offered Ξ ${a.price ?? 0} for ${a.nft.name}` : `Offer of Ξ ${a.price ?? 0} for ${a.nft.name}`,
                time: timeAgo(a.timestamp),
                read: false,
                icon: Tag,
              });
            }
          }
        }
      } catch {}

      // Follow/unfollow using followers snapshot
      try {
        const followersRes = await fetch(`http://localhost:8000/api/profiles/${address}/followers/`);
        const followersData = await followersRes.json();
        const key = `followersSnapshot:${address.toLowerCase()}`;
        const prev: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        const current: string[] = (followersData.followers || []).map((f: any) => (f.wallet_address || f.address || '').toLowerCase());
        const newFollowers = current.filter(a => !prev.includes(a));
        const unfollowed = prev.filter(a => !current.includes(a));
        newFollowers.forEach(a => items.push({ id: `follow-${a}`, type: 'follow', title: 'New follower', message: `${a} started following you`, time: 'just now', read: false, icon: UserPlus }));
        unfollowed.forEach(a => items.push({ id: `unfollow-${a}`, type: 'follow', title: 'Unfollowed', message: `${a} unfollowed you`, time: 'just now', read: false, icon: UserMinus }));
        localStorage.setItem(key, JSON.stringify(current));
      } catch {}

      setNotifications(items);
    };
    run();
  }, [address]);

  const getIconColor = (type: string, read: boolean) => {
    const opacity = read ? 'opacity-60' : '';
    switch (type) {
      case 'follow': return `text-blue-500 ${opacity}`;
      case 'like': return `text-red-500 ${opacity}`;
      case 'sale': return `text-green-500 ${opacity}`;
      case 'offer': return `text-yellow-500 ${opacity}`;
      default: return `text-gray-500 ${opacity}`;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Notifications</h1>
              <p className="text-muted-foreground">Stay updated with your NFT activities</p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Check className="h-4 w-4 mr-2" />
                Mark all as read
              </Button>
              <Button variant="outline" size="sm">
                <X className="h-4 w-4 mr-2" />
                Clear all
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="follow">Follow</TabsTrigger>
              <TabsTrigger value="like">Likes</TabsTrigger>
              <TabsTrigger value="sale">Sales</TabsTrigger>
              <TabsTrigger value="offer">Offers</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              <div className="space-y-4">
                {notifications.map((notification) => {
                  const IconComponent = notification.icon;
                  return (
                    <Card key={notification.id} className={`transition-colors hover:bg-muted/50 ${!notification.read ? 'border-primary/50 bg-primary/5' : ''}`}>
                      <CardContent className="flex items-start space-x-4 p-4">
                        <div className={`p-2 rounded-full bg-background ${getIconColor(notification.type, notification.read)}`}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className={`font-medium ${!notification.read ? 'font-semibold' : ''}`}>
                              {notification.title}
                            </h3>
                            <div className="flex items-center space-x-2">
                              {!notification.read && <Badge variant="secondary" className="text-xs">New</Badge>}
                              <span className="text-sm text-muted-foreground">{notification.time}</span>
                            </div>
                          </div>
                          <p className="text-muted-foreground text-sm mt-1">{notification.message}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {(['follow', 'like', 'sale', 'offer'] as NotificationType[]).map((type) => (
              <TabsContent key={type} value={type} className="mt-6">
                <div className="space-y-4">
                  {notifications.filter(n => n.type === type).map((notification) => {
                    const IconComponent = notification.icon;
                    return (
                      <Card key={notification.id} className={`transition-colors hover:bg-muted/50 ${!notification.read ? 'border-primary/50 bg-primary/5' : ''}`}>
                        <CardContent className="flex items-start space-x-4 p-4">
                          <div className={`p-2 rounded-full bg-background ${getIconColor(notification.type, notification.read)}`}>
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className={`font-medium ${!notification.read ? 'font-semibold' : ''}`}>
                                {notification.title}
                              </h3>
                              <div className="flex items-center space-x-2">
                                {!notification.read && <Badge variant="secondary" className="text-xs">New</Badge>}
                                <span className="text-sm text-muted-foreground">{notification.time}</span>
                              </div>
                            </div>
                            <p className="text-muted-foreground text-sm mt-1">{notification.message}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Notifications;
