
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, Zap, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { useWallet } from '@/contexts/WalletContext';
import { activityService } from '@/services/activityService';
import { apiService, NFT } from '@/services/api';

const HeroSection = () => {
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [stats, setStats] = useState({
    totalTraded: 0,
    activeCreators: 0,
    uniqueCollections: 0,
  });

  const handleExploreClick = () => {
    navigate('/marketplace');
  };

  const handleCreateClick = () => {
    if (!isConnected) {
      setShowWalletModal(true);
    } else {
      navigate('/create');
    }
  };

  const handleWatchDemo = () => {
    // Scroll to a demo section or open a modal. For now, navigate to stats.
    navigate('/stats');
  };

  // Load hero metrics from live backend data
  useEffect(() => {
    const loadMetrics = async () => {
      try {
        // 1) NFTs for creators and collections
        const creators = new Set<string>();
        const collections = new Set<string>();
        let page = 1;
        let hasNext = true;
        while (hasNext && page <= 50) {
          const res = await apiService.getNFTs({ page, limit: 200 });
          const nfts: NFT[] = res.data || [];
          for (const n of nfts) {
            if (n.creator_address) creators.add(n.creator_address);
            const cname = (n.collection || '').toString();
            if (cname) collections.add(cname);
          }
          hasNext = res.pagination?.has_next ?? false;
          page += 1;
          if (!res.pagination) break;
        }

        // 2) Activities for total traded (count of buys all-time)
        let totalTraded = 0;
        let aPage = 1;
        let aHasNext = true;
        while (aHasNext && aPage <= 100) {
          const resp = await activityService.getActivities({ type: 'buy', limit: 200, page: aPage });
          totalTraded += resp.data?.length || 0;
          aHasNext = resp.pagination?.has_next ?? false;
          aPage += 1;
        }

        setStats({
          totalTraded,
          activeCreators: creators.size,
          uniqueCollections: collections.size,
        });
      } catch (e) {
        // fallback remains zeros
      }
    };
    loadMetrics();
  }, []);

  const formatCompact = (num: number) => {
    try {
      const formatted = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(num);
      return `${formatted}`;
    } catch {
      return num.toLocaleString();
    }
  };

  return (
    <>
      <div className="relative bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 dark:from-purple-950/20 dark:via-blue-950/20 dark:to-indigo-950/20 py-20 overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-10 -right-10 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-500/20 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-200/20 dark:border-purple-800/20 mb-6">
                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                  🚀 The Future of Digital Ownership
                </span>
              </div>
              
              <h1 className="text-4xl md:text-7xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent leading-tight">
                Discover, Create & Trade
              </h1>
              <h2 className="text-3xl md:text-5xl font-bold text-foreground">
                Extraordinary NFTs
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Join the world's premier NFT marketplace where digital art meets blockchain technology. 
                Create, collect, and trade unique digital assets with complete ownership and authenticity.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 px-8 text-lg h-12"
                onClick={handleExploreClick}
              >
                Explore NFTs
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="px-8 text-lg h-12 border-2 hover:bg-muted/50"
                onClick={handleCreateClick}
              >
                Create NFT
              </Button>
              <Button 
                variant="ghost" 
                size="lg" 
                className="px-8 text-lg h-12 hover:bg-muted/50"
                onClick={handleWatchDemo}
              >
                <Play className="h-5 w-5 mr-2" />
                Watch Demo
              </Button>
            </div>

            {/* Enhanced Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
              <div className="text-center space-y-3 p-6 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background/70 transition-all">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-2xl">{formatCompact(stats.totalTraded)}</h3>
                <p className="text-muted-foreground font-medium">Total NFTs Traded</p>
              </div>
              <div className="text-center space-y-3 p-6 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background/70 transition-all">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-2xl">{formatCompact(stats.activeCreators)}</h3>
                <p className="text-muted-foreground font-medium">Active Creators</p>
              </div>
              <div className="text-center space-y-3 p-6 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background/70 transition-all">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-2xl">{formatCompact(stats.uniqueCollections)}</h3>
                <p className="text-muted-foreground font-medium">Unique Collections</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <WalletConnectionModal open={showWalletModal} onOpenChange={setShowWalletModal} />
    </>
  );
};

export default HeroSection;
