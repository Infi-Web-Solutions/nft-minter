
import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/config';
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
  type: string;
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

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'ShoppingBag': return ShoppingBag;
      case 'Tag': return Tag;
      case 'UserPlus': return UserPlus;
      case 'UserMinus': return UserMinus;
      case 'Heart': return Heart;
      default: return Heart;
    }
  };

  const getFilteredNotifications = (tab: string) => {
    switch (tab) {
      case 'all': return notifications;
      case 'like': return notifications.filter(n => n.type === 'like');
      case 'sale': return notifications.filter(n => n.type === 'buy');
      case 'offer': return notifications.filter(n => n.type === 'bid');
      case 'follow': return notifications.filter(n => n.type === 'follow' || n.type === 'unfollow');
      default: return notifications;
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!address) return;
      const res = await activityService.getNotifications(address);
      if (res.success) {
        const items: NotificationItem[] = res.data.map((n: any) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          time: n.time,
          read: n.read,
          icon: getIconComponent(n.icon),
        }));
        setNotifications(items);
      }
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
                  const IconComponent = getIconComponent(notification.icon);
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
                  {getFilteredNotifications(type).length > 0 ? (
                    getFilteredNotifications(type).map((notification) => {
                      const IconComponent = getIconComponent(notification.icon);
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
                    })
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No {type} notifications available</p>
                    </div>
                  )}
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
