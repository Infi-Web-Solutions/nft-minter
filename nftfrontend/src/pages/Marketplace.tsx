
import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Grid, List, Filter } from 'lucide-react';
import NFTCard from '@/components/NFTCard';
import FilterSidebar from '@/components/FilterSidebar';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CollateralLeasingSidebar from '@/components/CollateralLeasingSidebar';
import { apiUrl } from '@/config';
import { getNFTMarketplaceAddress, getWrappedLeasingAddress } from '@/services/configService';
import { leasingMarketplaceService } from '@/services/leasingMarketplaceApiService';
import { ethers } from 'ethers';

import { wrappedLeasingApiService } from '@/services/wrappedLeasingApiService';
import { nftService, NFT } from '@/services/nftService';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import { useLikedNFTs } from '@/contexts/LikedNFTsContext';
import { useSearchParams } from 'react-router-dom';

const Marketplace = () => {
  const { address } = useWallet();
  const { likedNFTIds, refreshLikedNFTs } = useLikedNFTs();
  const [searchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(true);
  // Derived loading state
  const isLoading = loadingLocal || loadingExternal;

  const [allNfts, setAllNfts] = useState<NFT[]>([]);
  const [wrappedMarketNfts, setWrappedMarketNfts] = useState<NFT[]>([]);
  const [externalListedNfts, setExternalListedNfts] = useState<NFT[]>([]);
  const [activeLoans, setActiveLoans] = useState<Map<string, { status: string, borrower: string, loanId: string }>>(new Map());
  const [activeListings, setActiveListings] = useState<Map<string, { listingId: number, status: string }>>(new Map());
  const [contractAddress, setContractAddress] = useState<string>('');
  const [wrappedLeasingAddress, setWrappedLeasingAddress] = useState<string>('');

  const [filters, setFilters] = useState({
    status: [] as string[],
    priceRange: [0, 100] as [number, number],
    collections: [] as string[],
    blockchain: [] as string[]
  });

  // Load contract addresses from config
  useEffect(() => {
    const loadAddresses = async () => {
      try {
        const [marketAddr, wrappedAddr] = await Promise.all([
          getNFTMarketplaceAddress(),
          getWrappedLeasingAddress()
        ]);
        setContractAddress(marketAddr);
        setWrappedLeasingAddress(wrappedAddr.toLowerCase());
      } catch (e) {
        console.error('[Marketplace] Failed to load contract addresses from config', e);
      }
    };
    loadAddresses();
  }, []);

  // Collateral Leasing State
  const [showCollateralSidebar, setShowCollateralSidebar] = useState(false);
  const [selectedLoanNft, setSelectedLoanNft] = useState<{ contract: string, tokenId: string, loanId?: string } | null>(null);

  // Fetch active loans
  useEffect(() => {
    const fetchActiveLoans = async () => {
      try {
        const res = await fetch(apiUrl('/loans/open'));
        const data = await res.json();
        if (data.success) {
          const loanMap = new Map<string, { status: string, borrower: string, loanId: string }>();
          data.data.forEach((loan: any) => {
            const key = `${loan.nftContract.toLowerCase()}-${loan.tokenId}`;
            loanMap.set(key, { status: loan.status, borrower: loan.borrower, loanId: loan.loanId });
          });
          setActiveLoans(loanMap);
        }
      } catch (err) {
        console.error('Failed to fetch active loans', err);
      }
    };
    fetchActiveLoans();
    fetchActiveLoans();
  }, []);

  // Fetch active marketplace listings (including wrapped wNFT listings)
  useEffect(() => {
    const fetchListings = async () => {
      if (!wrappedLeasingAddress) {
        // Wait until we know the wrapped contract address
        return;
      }
      setLoadingExternal(true);
      try {
        // First try to get listings from backend API
        console.log('[Marketplace] Fetching listings from backend...');
        const res = await fetch(apiUrl('/listings/active'));
        const data = await res.json();

        if (data.success && data.data && data.data.length > 0) {
          console.log('[Marketplace] Backend Listings Fetched:', data.data);
          const listingMap = new Map<string, { listingId: number, status: string }>();

          // Process all listings in parallel
          const results = await Promise.all(data.data.map(async (l: any) => {
            const key = `${String(l.nftAddress).toLowerCase()}-${String(l.tokenId)}`;
            listingMap.set(key, { listingId: l.listingId, status: l.status });

            // If this listing is for a wrapped NFT, build a synthetic NFT entry
            if (
              String(l.nftAddress).toLowerCase() === wrappedLeasingAddress &&
              (l.status === 'Active' || l.status === 'Rented')
            ) {
              try {
                const wId = String(l.tokenId);
                const info = await wrappedLeasingApiService.getWrappedInfo(wId);

                // EXPIRE CHECK: If the wNFT is not active or time is up, skip it
                const now = Math.floor(Date.now() / 1000);
                if (!info.active || (info.validUntil && info.validUntil < now)) {
                  console.log(`[Marketplace] Skipping expired/inactive wNFT #${wId}`);
                  // Optionally update backend status here too if we want to be proactive
                  return null;
                }

                // Load original NFT metadata for image/name
                let originalMeta: any = null;
                try {
                  const metaRes = await fetch(
                    apiUrl(`/nfts/external/${info.originalNft}/${info.originalTokenId}`)
                  );
                  const metaJson = await metaRes.json();
                  if (metaJson.success && metaJson.data) {
                    originalMeta = metaJson.data;
                  }
                } catch (metaErr) {
                  console.warn('[Marketplace] Failed to load original NFT metadata for wNFT', metaErr);
                }

                const displayName =
                  originalMeta?.name || `Wrapped NFT #${wId}`;
                const displayImage =
                  originalMeta?.image_url || originalMeta?.image || '';
                const displayCollection =
                  (typeof originalMeta?.collection === 'string'
                    ? originalMeta.collection
                    : originalMeta?.collection?.name) || 'Wrapped NFT';
                const displayDescription =
                  originalMeta?.description ||
                  'Wrapped lease NFT available for rent.';

                // Derive a daily price from pricePerSecond if available
                let dailyPrice = 0;
                if (l.pricePerSecond) {
                  try {
                    const perSecond = BigInt(l.pricePerSecond);
                    const perDay = perSecond * 86400n;
                    dailyPrice = parseFloat(ethers.formatEther(perDay));
                  } catch (e) {
                    console.warn('[Marketplace] Failed to parse pricePerSecond for wNFT listing', e);
                  }
                }

                const wnftNft: NFT & { nftType?: string } = {
                  id: `wnft_${l.listingId}`,
                  title: displayName,
                  name: displayName,
                  collection: displayCollection,
                  price: dailyPrice || '0',
                  image: displayImage,
                  image_url: displayImage,
                  token_id: wId,
                  description: displayDescription,
                  owner_address: info.owner,
                  creator_address: info.originalOwner,
                  is_listed: true,
                  isAuction: false,
                  is_auction: false,
                  status: l.status,
                  blockchain: 'Ethereum',
                  createdAt: l.createdAt,
                  source: 'local',
                  contract_address: wrappedLeasingAddress,
                  isWrapped: true,
                  nftType: info.originalNft.toLowerCase() === wrappedLeasingAddress.toLowerCase() ? 'wwNFT' : 'wNFT'
                };

                return { type: 'wrapped', data: wnftNft };
              } catch (wnftErr) {
                console.error('[Marketplace] Failed to build wrapped NFT listing card', wnftErr);
                return null;
              }
            } else {
              // It's a regular listing from the Leasing Marketplace (Direct Rental)
              // Fetch metadata to ensure we can display it
              try {
                // We fetch metadata for ALL active listings to ensure we have the latest data
                const metaRes = await fetch(
                  apiUrl(`/nfts/external/${l.nftAddress}/${l.tokenId}`)
                );
                const metaJson = await metaRes.json();

                if (metaJson.success && metaJson.data) {
                  const nftItem = metaJson.data;
                  // CORRECTION: Listings from /listings/active are RENTAL/LEASE listings, not Sales.
                  // So we must NOT mark is_listed=true (which means For Sale).
                  nftItem.is_listed = false;
                  nftItem.is_rentable = true; // Mark as rentable

                  // Calculate daily price from pricePerSecond
                  nftItem.price = l.pricePerSecond
                    ? parseFloat(ethers.formatEther(BigInt(l.pricePerSecond) * 86400n)) // Daily price
                    : nftItem.price;

                  // Add listingId to the NFT object so we can use it later
                  nftItem.listingId = l.listingId;

                  return { type: 'external', data: nftItem };
                }
              } catch (extErr) {
                console.error('[Marketplace] Failed to fetch metadata for listing:', l, extErr);
              }
              return null;
            }
          }));

          const wrappedNfts = results
            .filter(r => r && r.type === 'wrapped')
            .map(r => r!.data);

          const externalNfts = results
            .filter(r => r && r.type === 'external')
            .map(r => r!.data);

          setActiveListings(listingMap);
          setWrappedMarketNfts(wrappedNfts);
          setExternalListedNfts(externalNfts);
        } else {
          // No listings from backend
          setActiveListings(new Map());
          setWrappedMarketNfts([]);
          setExternalListedNfts([]);
        }
      } catch (backendError) {
        console.error('[Marketplace] Backend fetch failed:', backendError);
      } finally {
        setLoadingExternal(false);
      }

      // Fallback to blockchain if needed (logic remains similar but we won't block loadingExternal on it if backend succeeded)
      if (!window.ethereum) return;

      // ... blockchain fallback logic (optional to keep or remove, but keeping for safety)
      // For now, we assume backend is primary source.
    };
    fetchListings();
  }, [address, wrappedLeasingAddress]);



  // Initialize filters from URL query params
  useEffect(() => {
    const category = (searchParams.get('category') || '').toLowerCase();
    const statusParam = searchParams.get('status');

    if (category && ['all', 'art', 'gaming', 'music'].includes(category)) {
      setActiveTab(category);
    }
    if (statusParam) {
      setFilters(prev => ({ ...prev, status: [statusParam] }));
    }
  }, [searchParams]);

  // Fetch NFTs from API
  useEffect(() => {
    const fetchNFTs = async () => {
      setLoadingLocal(true);
      try {
        console.log('[Marketplace] Fetching with filters:', filters);
        const nfts = await nftService.getCombinedNFTs(address, filters, sortBy);
        console.log('[Marketplace] Fetched NFTs:', nfts.length);
        console.log('[Marketplace] First NFT sample:', nfts[0]);
        console.log('[Marketplace] All NFTs:', nfts);
        setAllNfts(nfts);
      } catch (error) {
        console.error('[Marketplace] Error fetching NFTs:', error);
        toast.error('Failed to load NFTs');
      } finally {
        setLoadingLocal(false);
      }
    };

    fetchNFTs();
  }, [address]);

  // Debug: Log whenever allNfts changes
  useEffect(() => {
    console.log('[Marketplace] allNfts state changed:', allNfts.length);
  }, [allNfts]);

  // Deduplicate NFTs by a robust key (contract + tokenId)
  const deduplicatedNfts = useMemo(() => {
    const combinedRaw = [...allNfts, ...wrappedMarketNfts, ...externalListedNfts];
    const seenKeys = new Set();
    return combinedRaw.filter(nft => {
      let cAddr = (nft as any).contract_address || '';
      if (!cAddr) {
        if (nft.source === 'local' || !nft.source) {
          cAddr = contractAddress;
        } else if (typeof nft.collection === 'string' && nft.collection.startsWith('0x')) {
          cAddr = nft.collection;
        }
      }

      const tId = nft.token_id !== undefined && nft.token_id !== null ? String(nft.token_id) : String(nft.id);
      const key = cAddr ? `${cAddr.toLowerCase()}-${tId}` : `fallback-${nft.id}`;

      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }, [allNfts, wrappedMarketNfts, externalListedNfts, contractAddress]);

  // Calculate top 4 collections dynamically
  const topCollections = useMemo(() => {
    const counts: { [key: string]: number } = {};
    deduplicatedNfts.forEach(nft => {
      const collectionName = typeof nft.collection === 'string' ? nft.collection : nft.collection?.name;
      if (collectionName) {
        counts[collectionName] = (counts[collectionName] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([name]) => name);
  }, [deduplicatedNfts]);

  // Debug: Log deduplicated Xano
  useEffect(() => {
    const xano = deduplicatedNfts.find(n => n.name && n.name.toLowerCase().includes('xano'));
    if (xano) {
      console.log('[Marketplace DEBUG] Found Xano in deduplicatedNfts:', {
        id: xano.id,
        is_listed: xano.is_listed,
        is_rentable: (xano as any).is_rentable,
        contract_address: xano.contract_address,
        source: xano.source
      });
    } else {
      console.log('[Marketplace DEBUG] Xano NOT found in deduplicatedNfts');
    }
  }, [deduplicatedNfts]);

  // Filter and sort NFTs based on current filters
  const filteredNfts = useMemo(() => {
    console.log('[Marketplace] Starting filter with', deduplicatedNfts.length, 'deduplicated NFTs');

    const getNumericPrice = (nft: NFT): number => {
      // prefer explicit price, then current_price, then first sell order (wei -> ETH)
      if (nft.price !== undefined && nft.price !== null) {
        return typeof nft.price === 'string' ? parseFloat(nft.price) : nft.price;
      }
      if (nft.current_price !== undefined && nft.current_price !== null) {
        return typeof nft.current_price === 'string' ? parseFloat(nft.current_price) : nft.current_price;
      }
      if (nft.sell_orders && nft.sell_orders.length > 0) {
        const first = nft.sell_orders[0];
        if (first.current_price !== undefined && first.current_price !== null) {
          const raw = parseFloat(String(first.current_price));
          if (!isNaN(raw)) return raw / (10 ** 18);
        }
      }
      return 0;
    };

    const hasStatus = (nft: NFT, statusLabel: string): boolean => {
      const contractAddr = (nft as any).contract_address || '';
      const loanKey = contractAddr ? `${contractAddr.toLowerCase()}-${String(nft.token_id)}` : '';
      const listingInfo = activeListings.get(loanKey);
      const isRentable = !!listingInfo;
      const isRented = listingInfo?.status === 'Rented';
      const loanInfo = loanKey ? activeLoans.get(loanKey) : undefined;

      switch (statusLabel) {
        case 'Buy Now':
          return Boolean(nft.is_listed);
        case 'On Auction':
          return Boolean(nft.is_auction || nft.isAuction);
        case 'New': {
          const created = nft.createdAt ? new Date(nft.createdAt).getTime() : 0;
          if (!created) return false;
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          return Date.now() - created <= sevenDaysMs;
        }
        case 'Has Offers':
          return Array.isArray(nft.sell_orders) && nft.sell_orders.length > 0;
        case 'On Rent':
          return (isRentable || nft.is_rentable) && !isRented;
        case 'Loan':
          return !!loanInfo;
        case 'Rented':
          return isRented;
        default:
          // fallback to direct status match if provided
          return (nft.status || '') === statusLabel;
      }
    };

    let filtered = deduplicatedNfts.filter((nft) => {
      // Tab filter by category
      if (activeTab !== 'all' && nft.category !== activeTab) return false;

      // Status filter (any of the selected statuses should match)
      if (filters.status.length > 0) {
        const anyMatch = filters.status.some((label) => hasStatus(nft, label));
        if (!anyMatch) return false;
      }

      // Price range filter (inclusive)
      const price = getNumericPrice(nft);
      if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;

      // Collections filter
      if (filters.collections.length > 0) {
        const collectionName = typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || '';
        if (!filters.collections.includes(collectionName)) return false;
      }

      // Blockchain filter
      if (filters.blockchain.length > 0) {
        const chain = nft.blockchain || '';
        if (!filters.blockchain.includes(chain)) return false;
      }

      return true;
    });

    // Sorting
    switch (sortBy) {
      case 'price-low':
        filtered.sort((a, b) => getNumericPrice(a) - getNumericPrice(b));
        break;
      case 'price-high':
        filtered.sort((a, b) => getNumericPrice(b) - getNumericPrice(a));
        break;
      case 'ending':
        filtered = filtered
          .filter(nft => nft.isAuction || nft.is_auction)
          .sort(() => Math.random() - 0.5);
        break;
      case 'most-liked':
        filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case 'recent':
      default:
        filtered.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
    }

    console.log('[Marketplace] Final filtered result:', filtered.length);
    return filtered;
  }, [activeTab, filters, sortBy, deduplicatedNfts]);

  // Debug: Log filtered results
  useEffect(() => {
    console.log('[Marketplace] filteredNfts result:', filteredNfts.length);
    if (filteredNfts.length > 0) {
      console.log('[Marketplace] First filtered NFT:', filteredNfts[0]);
      console.log('[Marketplace] First NFT price:', filteredNfts[0].price);
      console.log('[Marketplace] First NFT price type:', typeof filteredNfts[0].price);
      console.log('[Marketplace] First NFT image:', filteredNfts[0].image);
      console.log('[Marketplace] First NFT image_url:', filteredNfts[0].image_url);
      console.log('[Marketplace] First NFT collection:', filteredNfts[0].collection);
    }
  }, [filteredNfts]);

  const handleFilterChange = (filterType: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleClearAllFilters = () => {
    setFilters({
      status: [] as string[],
      priceRange: [0, 100] as [number, number],
      collections: [] as string[],
      blockchain: [] as string[]
    });
  };

  const handleLikeToggle = async (nftId: string | number, newLikedState: boolean) => {
    if (!address) {
      toast.error('Please connect your wallet first');
      return;
    }

    console.log('[Marketplace] handleLikeToggle called with:', {
      nftId,
      nftId_type: typeof nftId,
      newLikedState,
      currentLikedState: likedNFTIds.has(String(nftId))
    });

    try {
      const result = await nftService.toggleNFTLike(nftId, address);
      console.log('[Marketplace] toggleNFTLike result:', result);
      if (result.success) {
        // Use the actual liked state from the backend
        const actualLikedState = result.liked !== undefined ? result.liked : newLikedState;
        console.log('[Marketplace] Setting actual liked state:', actualLikedState);
        // Update the local state immediately for better UX
        setAllNfts(prevNfts =>
          prevNfts.map(nft =>
            nft.id === nftId
              ? { ...nft, liked: actualLikedState }
              : nft
          )
        );
        toast.success(actualLikedState ? 'Added to favorites' : 'Removed from favorites');
        await refreshLikedNFTs();
      } else {
        toast.error(result.error || 'Failed to update like status');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update like status');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading NFTs...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Explore NFTs</h1>
            <p className="text-muted-foreground">Discover the world's top crypto art and collectibles</p>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </Button>

            <div className="flex items-center space-x-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="art">Art</TabsTrigger>
            <TabsTrigger value="gaming">Gaming</TabsTrigger>
            <TabsTrigger value="music">Music</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            Showing {filteredNfts.length} of {deduplicatedNfts.length} NFTs
          </p>

          <div className="flex items-center space-x-4">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently Listed</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="ending">Ending Soon</SelectItem>
                <SelectItem value="most-liked">Most Liked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-6">
          {showFilters && (
            <FilterSidebar
              filters={filters}
              onFilterChange={handleFilterChange}
              onClearAll={handleClearAllFilters}
              dynamicCollections={topCollections}
            />
          )}

          <div className="flex-1">
            <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
              {filteredNfts.map((nft) => {
                // Debug each NFT being rendered
                console.log('[Marketplace] Rendering NFT:', {
                  id: nft.id,
                  id_type: typeof nft.id,
                  title: nft.title || nft.name,
                  image: nft.image,
                  image_url: nft.image_url,
                  price: nft.price,
                  current_price: nft.current_price,
                  sell_orders: nft.sell_orders,
                  collection: nft.collection,
                  source: nft.source,
                  token_id: nft.token_id
                });

                // Determine the correct image URL
                const imageUrl = nft.image_url || nft.image || '';

                // Determine the correct price - check multiple sources
                let price = 0;
                if (nft.price) {
                  price = typeof nft.price === 'string' ? parseFloat(nft.price) : nft.price;
                } else if (nft.current_price) {
                  price = typeof nft.current_price === 'string' ? parseFloat(nft.current_price) : nft.current_price;
                } else if (nft.sell_orders && nft.sell_orders.length > 0) {
                  // Extract price from sell orders
                  const sellOrder = nft.sell_orders[0];
                  if (sellOrder.current_price) {
                    price = parseFloat(String(sellOrder.current_price)) / (10 ** 18); // Convert from wei
                  }
                }

                const priceString = price > 0 ? price.toFixed(4) : '0';

                console.log('[Marketplace] Final price calculation:', {
                  original_price: nft.price,
                  current_price: nft.current_price,
                  calculated_price: price,
                  price_string: priceString
                });

                // Determine loan / listing contract address
                let contractAddr = (nft as any).contract_address || '';
                if (!contractAddr) {
                  if (nft.source === 'local' || !nft.source) {
                    // Fallback to main marketplace contract for local NFTs
                    contractAddr = contractAddress;
                  } else if (typeof nft.collection === 'string' && nft.collection.startsWith('0x')) {
                    // For external NFTs, collection may store the contract address
                    contractAddr = nft.collection as string;
                  }
                }

                const loanKey = contractAddr ? `${contractAddr.toLowerCase()}-${String(nft.token_id)}` : '';
                // DEBUG: Force rentable for testing if needed, but let's log first
                const listingInfo = activeListings.get(loanKey);
                // An NFT is rentable if it has an active listing OR it's marked as rentable/rented in DB
                const isRentable = !!listingInfo || nft.is_rentable || nft.is_rented;
                const isRented = listingInfo?.status === 'Rented' || nft.is_rented;
                const isOwner =
                  !!address &&
                  !!nft.owner_address &&
                  address.toLowerCase() === nft.owner_address.toLowerCase();

                // DEBUG LOG
                console.log('[Marketplace] Checking Rentable:', {
                  nftTitle: nft.title || nft.name,
                  rawContract: contractAddr,
                  rawTokenId: nft.token_id,
                  generatedKey: loanKey,
                  inMap: activeListings.has(loanKey),
                  listingId: listingInfo?.listingId,
                  status: listingInfo?.status,
                  isRentable,
                  isRented,
                  isOwner,
                  currentUser: address,
                  nftOwner: nft.owner_address
                });
                if (isRentable) {
                  console.log('[Marketplace] NFT is Rentable:', {
                    id: nft.id,
                    token_id: nft.token_id,
                    contract: contractAddr,
                    key: loanKey,
                    status: listingInfo?.status,
                    isOwner: address && nft.owner_address && address.toLowerCase() === nft.owner_address.toLowerCase()
                  });
                }

                let loanInfo = loanKey ? activeLoans.get(loanKey) : undefined;
                if (!loanInfo && (nft.source === 'local' || !nft.source) && nft.token_id) {
                  const tokenIdStr = String(nft.token_id);
                  for (const [key, info] of activeLoans.entries()) {
                    if (key.endsWith(`-${tokenIdStr}`)) {
                      loanInfo = info;
                      break;
                    }
                  }
                }

                let badgeType = (nft as any).nftType;

                if (!badgeType) {
                  if (isRented) {
                    badgeType = 'Rented';
                  } else if (nft.isAuction || nft.is_auction) {
                    badgeType = 'Auction';
                  } else if (isRentable) {
                    badgeType = 'For Rent';
                  } else if (nft.is_listed) {
                    badgeType = 'For Sale';
                  } else {
                    badgeType = 'NFT';
                  }
                }

                return (
                  <NFTCard
                    key={`nft-${nft.source || 'local'}-${nft.token_id ?? nft.id}-${typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'unknown'}`}
                    title={nft.title || nft.name}
                    collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                    price={priceString}
                    image={imageUrl}
                    tokenId={nft.token_id}
                    id={nft.id}
                    liked={likedNFTIds.has(String(nft.id))}
                    isAuction={nft.isAuction || nft.is_auction}
                    timeLeft={nft.timeLeft}
                    views={nft.views}
                    onLike={(newLikedState) => {
                      // Pass the full NFT ID and new liked state to the like handler
                      handleLikeToggle(nft.id, newLikedState);
                    }}
                    owner_address={nft.owner_address}
                    is_listed={isRentable ? false : nft.is_listed}
                    loanStatus={loanInfo?.status}
                    loanBorrower={loanInfo?.borrower}
                    loanId={loanInfo?.loanId}
                    nftType={badgeType as any}
                    onRequestLoan={() => {
                      setSelectedLoanNft({
                        contract: contractAddr,
                        tokenId: String(nft.token_id),
                        loanId: loanInfo?.loanId
                      });
                      setShowCollateralSidebar(true);
                    }}



                    // Marketplace Renting Props
                    // Marketplace Renting Props
                    isRentable={isRentable}
                    isRented={isRented}
                    onRent={() => {
                      if (!isRented) {
                        setSelectedLoanNft({
                          contract: contractAddr,
                          tokenId: String(nft.token_id)
                        });
                        setShowCollateralSidebar(true);
                      }
                    }}
                    // Custom click behavior for rentable NFTs to avoid bad redirects:
                    // - For rentable items, clicking the card opens the rent/manage sidebar
                    // - For non-rentable items, NFTCard handles navigation to /nft/:id or /wnft/:wId
                    onClick={
                      nft.isWrapped
                        ? () => window.location.href = `/wnft/${nft.token_id}`
                        : isRented
                          ? () => {
                            const targetWId = (listingInfo as any)?.wId || nft.wId;
                            if (targetWId) {
                              window.location.href = `/wnft/${targetWId}`;
                            } else {
                              window.location.href = `/nft/${nft.id}`;
                            }
                          }
                          : isRentable && !nft.isWrapped
                            ? () => {
                              setSelectedLoanNft({
                                contract: contractAddr,
                                tokenId: String(nft.token_id)
                              });
                              setShowCollateralSidebar(true);
                            }
                            : undefined
                    }
                  />
                );
              })}
            </div>

            {filteredNfts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground mb-4">No NFTs match your current filters</p>
                <Button variant="outline" onClick={handleClearAllFilters}>
                  Clear All Filters
                </Button>
              </div>
            ) : (
              <div className="flex justify-center mt-12">
                <Button variant="outline" size="lg">
                  Load More NFTs
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <CollateralLeasingSidebar
        open={showCollateralSidebar}
        onOpenChange={setShowCollateralSidebar}
        initialContractAddress={selectedLoanNft?.contract}
        initialTokenId={selectedLoanNft?.tokenId}
        initialLoanId={selectedLoanNft?.loanId}
      />
      <Footer />
    </div>
  );
};

export default Marketplace;
