const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const TESTNET_URL = "https://eth-sepolia.g.alchemy.com/v2/Bxo3zUQluKPV1Z9k0ajGE"

const ETHERSCAN_API_KEY = "UKBK8JQV3H56272HGXQVGEY9UNZIMG4DSE"

const CONTRACT_ADDRESS = "0xAB6FEdb0AdB537166425fd2bBd1F416b99899201"
const TX_HASH = "0x66769ae350688f8361e3435b871a739a0942cbdbd3a01ceca021dbe753876ff1"

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const rpc = args.rpc || process.env.TESTNET_URL || TESTNET_URL;
  const contractAddress = CONTRACT_ADDRESS;
  const tokenArg = args.token || process.env.TOKEN_ID || "49";
  const gateway = args.gateway || process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs/';

  if (!rpc) {
    console.error('Missing RPC. Set --rpc or TESTNET_URL');
    process.exit(1);
  }
  if (!contractAddress) {
    console.error('Missing contract address. Set --contract or CONTRACT_ADDRESS');
    process.exit(1);
  }
  if (!tokenArg) {
    console.error('Missing token id. Set --token or TOKEN_ID');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);

  const abiPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'nftmarketplace.sol', 'NFTMarketplace.json');
  if (!fs.existsSync(abiPath)) {
    console.error('ABI not found at', abiPath);
    process.exit(1);
  }
  const abiJson = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

  const contract = new ethers.Contract(contractAddress, abiJson.abi, provider);

  const tokenId = (() => {
    try {
      if (typeof tokenArg === 'string' && tokenArg.startsWith('0x')) return BigInt(tokenArg);
      return BigInt(tokenArg.toString());
    } catch (e) { return tokenArg; }
  })();

  console.log('Contract:', contractAddress);
  console.log('TokenId:', tokenId.toString());

  // Fetch basic contract info
  try {
    const name = await contract.name();
    const symbol = await contract.symbol();
    console.log('Contract Name:', name);
    console.log('Symbol:', symbol);
  } catch (e) {
    console.warn('Could not read contract name/symbol:', e.message || e);
  }

  // Read on-chain NFT metadata struct if available
  try {
    const meta = await contract.getNFTMetadata(tokenId);
    console.log('\nOn-chain NFT metadata:');
    console.log({
      name: meta.name,
      description: meta.description,
      metadataURI: meta.metadataURI,
      category: meta.category,
      royaltyPercentage: meta.royaltyPercentage ? meta.royaltyPercentage.toString() : meta.royaltyPercentage,
      creator: meta.creator,
      createdAt: meta.createdAt ? meta.createdAt.toString() : meta.createdAt,
      collection: meta.collection,
      exists: meta.exists
    });

    // fetch metadata JSON if metadataURI provided
    const uri = meta.metadataURI || null;
    if (uri) {
      let url = uri;
      if (uri.startsWith('ipfs://')) {
        const hash = uri.replace('ipfs://', '');
        url = gateway.endsWith('/') ? gateway + hash : gateway + '/' + hash;
      }
      console.log('\nFetching metadata from:', url);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const contentType = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
        // If JSON, parse and print
        if (contentType.includes('application/json') || url.endsWith('.json')) {
          const json = await res.json();
          console.log('\nMetadata JSON:');
          console.log(JSON.stringify(json, null, 2));
        } else if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(url)) {
          // It's an image — print the image URL and optionally save
          console.log('\nMetadata points to an image (not JSON). Image URL:', url);
          // Save image locally for inspection
          try {
            const buffer = Buffer.from(await res.arrayBuffer());
            const downloadsDir = path.join(__dirname, '..', 'downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
            const ext = contentType.split('/')[1] || 'bin';
            const outPath = path.join(downloadsDir, `token-${tokenId.toString()}.${ext}`);
            fs.writeFileSync(outPath, buffer);
            console.log('Saved image to', outPath);
          } catch (saveErr) {
            console.warn('Failed to save image locally:', saveErr.message || saveErr);
          }
        } else {
          // Unknown content type — try to parse as text JSON, otherwise save raw
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            console.log('\nParsed metadata JSON (fallback):');
            console.log(JSON.stringify(json, null, 2));
          } catch (parseErr) {
            console.warn('Fetched content is not JSON. Saving raw response to downloads for inspection.');
            try {
              const buffer = Buffer.from(text);
              const downloadsDir = path.join(__dirname, '..', 'downloads');
              if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
              const outPath = path.join(downloadsDir, `token-${tokenId.toString()}.raw`);
              fs.writeFileSync(outPath, buffer);
              console.log('Saved raw content to', outPath);
            } catch (saveErr) {
              console.warn('Failed to save raw response:', saveErr.message || saveErr);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to fetch metadata:', e.message || e);
      }
    }
  } catch (e) {
    console.warn('getNFTMetadata failed:', e.message || e);
  }

  // Read tokenURI() as fallback
  try {
    const uri2 = await contract.tokenURI(tokenId);
    console.log('\ntokenURI():', uri2);
  } catch (e) {
    // ignore
  }

  // Read listing info
  try {
    const listing = await contract.getListing(tokenId);
    const price = listing.price ? ethers.formatEther(listing.price) : null;
    console.log('\nOn-chain listing:');
    console.log({ seller: listing.seller, price, isActive: listing.isActive, isAuction: listing.isAuction, auctionEndTime: listing.auctionEndTime ? listing.auctionEndTime.toString() : listing.auctionEndTime });
  } catch (e) {
    console.warn('getListing failed:', e.message || e);
  }

}

main().catch(err => { console.error(err); process.exit(1); });
