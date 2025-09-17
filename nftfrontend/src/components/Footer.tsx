import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Twitter, MessageCircle, Instagram, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-card border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Link to="/" className="flex items-center space-x-2">
                <img src="/logo.png" alt="NFTMarket" className="h-8 w-8 rounded-lg object-cover" />
                <span className="text-xl font-bold">NFTMarket</span>
              </Link>
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
              <Link to="/marketplace" className="block text-muted-foreground hover:text-foreground">All NFTs</Link>
              <Link to="/marketplace?status=New" className="block text-muted-foreground hover:text-foreground">New</Link>
              <Link to="/marketplace?category=art" className="block text-muted-foreground hover:text-foreground">Art</Link>
              <Link to="/marketplace?category=gaming" className="block text-muted-foreground hover:text-foreground">Gaming</Link>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">My Account</h4>
            <div className="space-y-2 text-sm">
              <Link to="/profile" className="block text-muted-foreground hover:text-foreground">Profile</Link>
              <Link to="/favorites" className="block text-muted-foreground hover:text-foreground">Favorites</Link>
              <Link to="/profile#collected" className="block text-muted-foreground hover:text-foreground">My Collections</Link>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Resources</h4>
            <div className="space-y-2 text-sm">
              <Link to="/contact" className="block text-muted-foreground hover:text-foreground">Help Center</Link>
              <Link to="/stats" className="block text-muted-foreground hover:text-foreground">Platform Status</Link>
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
