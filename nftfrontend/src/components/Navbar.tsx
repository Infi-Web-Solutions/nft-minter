import React, { useState } from 'react';
import { Search, User, Bell, Menu, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from '@/components/ui/navigation-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from '@/components/ThemeToggle';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { useWallet } from '@/contexts/WalletContext';

const Navbar = () => {
  const navigate = useNavigate();
  const { isConnected, address, balance, chainId, disconnectWallet, isLoading } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (bal: string) => {
    const num = parseFloat(bal);
    if (num < 0.001) return '< 0.001';
    return num.toFixed(3);
  };

  const getNetworkName = (chainId: number | null) => {
    switch (chainId) {
      case 1: return 'Ethereum';
      case 11155111: return 'Sepolia';
      case 137: return 'Polygon';
      case 80001: return 'Mumbai';
      default: return 'Unknown';
    }
  };

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
              
              <div className="hidden md:flex">
                <NavigationMenu>
                  <NavigationMenuList>
                    <NavigationMenuItem>
                      <NavigationMenuTrigger>Explore</NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <div className="grid gap-3 p-6 w-[400px]">
                          <NavigationMenuLink asChild>
                            <Link to="/marketplace" className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                              <div className="text-sm font-medium leading-none">Marketplace</div>
                              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                Browse and discover amazing NFTs
                              </p>
                            </Link>
                          </NavigationMenuLink>

                          <NavigationMenuLink asChild>
                            <Link to="/collections" className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                              <div className="text-sm font-medium leading-none">Collections</div>
                              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                Explore top NFT collections
                              </p>
                            </Link>
                          </NavigationMenuLink>
                          <NavigationMenuLink asChild>
                            <Link to="/rankings" className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                              <div className="text-sm font-medium leading-none">Rankings</div>
                              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                Top collections and creators
                              </p>
                            </Link>
                          </NavigationMenuLink>
                        </div>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                      <NavigationMenuLink asChild>
                        <Link to="/create" className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50">
                          Create
                        </Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                      <NavigationMenuTrigger>Activity</NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <div className="grid gap-3 p-6 w-[300px]">
                          <NavigationMenuLink asChild>
                            <Link to="/activity" className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                              <div className="text-sm font-medium leading-none">Activity Feed</div>
                              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                Track marketplace activities
                              </p>
                            </Link>
                          </NavigationMenuLink>
                          <NavigationMenuLink asChild>
                            <Link to="/stats" className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                              <div className="text-sm font-medium leading-none">Statistics</div>
                              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                Market analytics and insights
                              </p>
                            </Link>
                          </NavigationMenuLink>
                        </div>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  </NavigationMenuList>
                </NavigationMenu>
              </div>
            </div>

            {/* Search */}
            <div className="hidden md:flex flex-1 max-w-lg mx-8">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input 
                  placeholder="Search items, collections, and accounts"
                  className="pl-10 bg-muted/50 border-0"
                  onChange={(e) => {
                    // For now, just log the search term
                    console.log('Search:', e.target.value);
                    // TODO: Implement actual search functionality
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => navigate('/notifications')}>
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => navigate('/profile')}>
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
                      <div className="text-xs text-muted-foreground">
                        {getNetworkName(chainId)}
                      </div>
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
              
              <Button variant="ghost" size="sm" className="md:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>
      
      <WalletConnectionModal open={showWalletModal} onOpenChange={setShowWalletModal} />
    </>
  );
};

export default Navbar;
