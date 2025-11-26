import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NFTCard from '@/components/NFTCard';
import { apiUrl } from '@/config';

const CollectionDetails = () => {
  const { slug } = useParams();
  const [collection, setCollection] = useState<any>(null);
  const [nfts, setNFTs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    const fetchCollection = async () => {
      setLoading(true);
      try {
        // Fetch collection details (local only)
        const colRes = await fetch(apiUrl(`/collections/?slug=${slug}`));
        const colData = await colRes.json();
        if (colData.success && colData.data.length > 0) {
          setCollection(colData.data[0]);
        } else {
          setCollection(null);
        }

        // Fetch only local NFTs and filter by collection name
        const nftsRes = await fetch(apiUrl(`/nfts/combined/`));
        const nftsData = await nftsRes.json();
        if (nftsData.success) {
          const filtered = (nftsData.data || []).filter((n: any) => {
            const name = typeof n.collection === 'string' ? n.collection : n.collection?.name;
            return name && colData?.data?.[0]?.name && name === colData.data[0].name;
          });
          setNFTs(filtered);
        } else {
          setNFTs([]);
        }
      } catch (e) {
        setCollection(null);
        setNFTs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCollection();
  }, [slug]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!collection) return <div className="p-8 text-center">Collection not found.</div>;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="w-full h-60 bg-muted flex items-end relative">
        {collection.banner_url && (
          <img src={collection.banner_url} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="relative z-10 flex items-end gap-6 p-8 w-full">
          <img src={collection.image_url || '/placeholder.svg'} alt="Profile" className="w-32 h-32 rounded-xl border-4 border-background bg-background -mb-12" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{collection.name}</h1>
            <div className="text-muted-foreground text-sm mt-1">By {collection.creator_address}</div>
            <div className="flex gap-6 mt-4">
              <div><span className="font-bold">{collection.total_items}</span> items</div>
              <div><span className="font-bold">Ξ{collection.floor_price}</span> floor</div>
              <div><span className="font-bold">Ξ{collection.total_volume}</span> volume</div>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto w-full p-4 mt-16">
        <div className="mb-8 text-muted-foreground">{collection.description}</div>
        <div className="flex gap-8">
          <aside className="w-64 hidden lg:block">
            {/* Sidebar filters placeholder */}
            <div className="bg-card rounded-lg p-4 mb-4">Filters (coming soon)</div>
          </aside>
          <main className="flex-1">
            <div className="mb-4 flex justify-between items-center">
              <input className="input w-64" placeholder="Search by item or trait" />
              <select className="input">
                <option>Price low to high</option>
                <option>Price high to low</option>
                <option>Recently listed</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {nfts.length === 0 ? (
                <div className="col-span-full text-center text-muted-foreground">No NFTs found in this collection.</div>
              ) : (
                nfts.map((nft: any) => (
                  <NFTCard
                    key={nft.id}
                    {...nft}
                    image={nft.image_url}
                    tokenId={nft.token_id}
                    id={nft.id}
                    price={nft.price ? nft.price.toString() : '0'}
                    title={nft.name}
                    collection={typeof nft.collection === 'string' ? nft.collection : nft.collection?.name || 'Unknown Collection'}
                    owner_address={nft.owner_address}
                    is_listed={nft.is_listed}
                    onClick={() => {
                      // Fix redirect issue: remove 'local_' prefix if present
                      const cleanNftId = typeof nft.id === 'string' && nft.id.startsWith('local_') ? nft.id.slice(6) : nft.id;
                      window.location.href = `/nft/${cleanNftId}`;
                    }}
                  />
                ))
              )}
            </div>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CollectionDetails;