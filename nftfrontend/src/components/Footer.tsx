import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Twitter, MessageCircle, Instagram, Youtube } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-card border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg"></div>
              <span className="text-xl font-bold">NFTMarket</span>
            </div>
            <p className="text-muted-foreground text-sm">
              The world's largest digital marketplace for crypto collectibles and non-fungible tokens.
            </p>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm">
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm">
                <Instagram className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm">
                <Youtube className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Marketplace</h4>
            <div className="space-y-2 text-sm">
              <a href="#" className="block text-muted-foreground hover:text-foreground">All NFTs</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Solana NFTs</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">New</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Art</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Gaming</a>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">My Account</h4>
            <div className="space-y-2 text-sm">
              <a href="#" className="block text-muted-foreground hover:text-foreground">Profile</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Favorites</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Watchlist</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">My Collections</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Settings</a>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Resources</h4>
            <div className="space-y-2 text-sm">
              <a href="#" className="block text-muted-foreground hover:text-foreground">Help Center</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Platform Status</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Partners</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Gas-Free Marketplace</a>
              <a href="#" className="block text-muted-foreground hover:text-foreground">Blog</a>
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <p className="text-muted-foreground text-sm">
            © 2024 NFTMarket. All rights reserved.
          </p>
          <div className="flex space-x-6 text-sm">
            <a href="#" className="text-muted-foreground hover:text-foreground">Privacy Policy</a>
            <a href="#" className="text-muted-foreground hover:text-foreground">Terms of Service</a>
            <a href="#" className="text-muted-foreground hover:text-foreground">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
