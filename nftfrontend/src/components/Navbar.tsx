import React, { useState, useEffect } from 'react';
import { Search, User, Bell, Menu, LogOut, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from '@/components/ThemeToggle';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { useWallet } from '@/contexts/WalletContext';
import { activityService } from '@/services/activityService';

const Navbar = () => {
  const navigate = useNavigate();
  const { isConnected, address, balance, chainId, disconnectWallet, isLoading } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatBalance = (bal: string) => {
    const num = parseFloat(bal);
    if (num < 0.001) return '< 0.001';
    return num.toFixed(3);
  };
  const getNetworkName = (chainId: number | null) => {
    switch (chainId) {
      case 1:
        return 'Ethereum';
      case 11155111:
        return 'Sepolia';
      case 137:
        return 'Polygon';
      case 80001:
        return 'Mumbai';
      default:
        return 'Unknown';
    }
  };

  useEffect(() => {
    if (!address) {
      setNotificationCount(0);
      return;
    }
    const fetchNotificationCount = async () => {
      try {
        const res = await activityService.getNotifications(address, 1, 1);
        if (res.success) {
          setNotificationCount(res.pagination.total_items);
        }
      } catch (error) {
        setNotificationCount(0);
      }
    };
    fetchNotificationCount();
  }, [address]);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-background border-b border-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2">
                <img src="/logo.png" alt="NFTMinter" className="h-8 w-8 rounded" />
                <span className="text-xl font-bold">NFTMinter</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex flex-1 items-center justify-between mx-8">
              <NavigationMenu>
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuTrigger>Explore</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid gap-3 p-6 w-[400px]">
                        <NavigationMenuLink asChild>
                          <Link
                            to="/marketplace"
                            className="block rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Marketplace</div>
                            <p className="text-sm text-muted-foreground">Browse and discover NFTs</p>
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link
                            to="/collections"
                            className="block rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Collections</div>
                            <p className="text-sm text-muted-foreground">Explore top NFT collections</p>
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link
                            to="/rankings"
                            className="block rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Rankings</div>
                            <p className="text-sm text-muted-foreground">Top collections and creators</p>
                          </Link>
                        </NavigationMenuLink>
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                      <Link
                        to="/create"
                        className="group inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                      >
                        Create
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuTrigger>Activity</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid gap-3 p-6 w-[300px]">
                        <NavigationMenuLink asChild>
                          <Link
                            to="/activity"
                            className="block rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Activity Feed</div>
                            <p className="text-sm text-muted-foreground">Track marketplace activities</p>
                          </Link>
                        </NavigationMenuLink>
                        <NavigationMenuLink asChild>
                          <Link
                            to="/stats"
                            className="block rounded-md p-3 hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Statistics</div>
                            <p className="text-sm text-muted-foreground">Market analytics and insights</p>
                          </Link>
                        </NavigationMenuLink>
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>

              {/* Search */}
              <div className="flex-1 max-w-lg mx-8 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search items, collections, and accounts"
                  className="pl-10 bg-muted/50 border-0"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex relative"
                onClick={() => navigate('/notifications')}
              >
                <Bell className="h-4 w-4" />
                {notificationCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex"
                onClick={() => navigate('/profile')}
              >
                <User className="h-4 w-4" />
              </Button>

              {/* Wallet Connection */}
              {isConnected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        {formatAddress(address!)}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <div className="p-2 border-b">
                      <div className="text-sm font-medium">{formatAddress(address!)}</div>
                      <div className="text-xs text-muted-foreground">
                        {balance ? `${formatBalance(balance)} ETH` : 'Loading...'}
                      </div>
                      <div className="text-xs text-muted-foreground">{getNetworkName(chainId)}</div>
                    </div>
                    <DropdownMenuItem onClick={() => navigator.clipboard.writeText(address!)}>
                      Copy Address
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`https://etherscan.io/address/${address}`, '_blank')}>
                      View on Etherscan
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={disconnectWallet} className="text-red-600">
                      <LogOut className="h-4 w-4 mr-2" />
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
                  onClick={() => setShowWalletModal(true)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Wallet'
                  )}
                </Button>
              )}

              {/* Mobile Menu Button */}
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          ></div>

          {/* Sidebar */}
          <div className="relative ml-auto w-80 bg-background shadow-lg p-6 flex flex-col space-y-4 overflow-y-auto z-10">
            <Button
              variant="ghost"
              onClick={() => setMobileMenuOpen(false)}
              className="self-end"
            >
              <X className="h-5 w-5" />
            </Button>

            {/* Navigation Buttons */}
            {[
              { label: 'Marketplace', path: '/marketplace' },
              { label: 'Collections', path: '/collections' },
              { label: 'Rankings', path: '/rankings' },
              { label: 'Create', path: '/create' },
              { label: 'Activity', path: '/activity' },
              { label: 'Statistics', path: '/stats' },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                className="text-left w-full p-2 rounded hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </button>
            ))}

            {/* Wallet */}
            {isConnected ? (
              <div className="border-t pt-4">
                <div>{formatAddress(address!)}</div>
                <div>{balance ? `${formatBalance(balance)} ETH` : 'Loading...'}</div>
                <div>{getNetworkName(chainId)}</div>
                <Button onClick={disconnectWallet} className="mt-2 text-red-600">
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={() => setShowWalletModal(true)}>Connect Wallet</Button>
            )}

            <ThemeToggle />
          </div>
        </div>
      )}


      <WalletConnectionModal open={showWalletModal} onOpenChange={setShowWalletModal} />
    </>
  );
};

export default Navbar;
