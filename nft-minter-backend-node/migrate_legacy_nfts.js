import mongoose from 'mongoose';

// Connect to MongoDB
const MONGO_URI = 'mongodb://127.0.0.1:27017/nft-minter';
mongoose.connect(MONGO_URI);

// Define the legacy data schema (single document with nfts array)
const legacySchema = new mongoose.Schema({
    nfts: Array
});
const LegacyData = mongoose.model('nft', legacySchema, 'nfts'); // Use 'nfts' collection name

// Define the new NFT schema (individual documents)
const nftSchema = new mongoose.Schema({
    token_id: { type: Number, unique: true, required: true },
    name: { type: String, required: true },
    description: { type: String },
    image_url: { type: String },
    token_uri: { type: String },
    owner_address: { type: String, required: true },
    creator_address: { type: String, required: true },
    price: { type: Number },
    is_listed: { type: Boolean, default: false },
    is_auction: { type: Boolean, default: false },
    auction_end_time: { type: Date },
    current_bid: { type: Number },
    highest_bidder: { type: String },
    royalty_percentage: { type: Number, default: 0 },
    nft_collection: { type: String },
    category: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// First, temporarily use a different collection name to avoid conflicts
const NFTTemp = mongoose.model('NFTTemp', nftSchema, 'nfts_individual');

async function migrateLegacyData() {
    try {
        console.log('Starting migration...');
        
        // Get the legacy document with all NFTs
        const legacyDoc = await LegacyData.findOne();
        
        if (!legacyDoc || !legacyDoc.nfts) {
            console.log('No legacy NFT data found to migrate');
            return;
        }
        
        console.log(`Found ${legacyDoc.nfts.length} NFTs to migrate`);
        
        // Clear any existing individual documents
        await NFTTemp.deleteMany({});
        
        // Convert each NFT from the array to individual documents
        for (const legacyNft of legacyDoc.nfts) {
            const nftData = {
                token_id: legacyNft.token_id,
                name: legacyNft.name,
                description: legacyNft.description,
                image_url: legacyNft.image_url,
                token_uri: legacyNft.token_uri,
                owner_address: legacyNft.owner_address,
                creator_address: legacyNft.creator_address,
                price: legacyNft.price,
                is_listed: Boolean(legacyNft.is_listed), // Convert 1/0 to boolean
                is_auction: Boolean(legacyNft.is_auction), // Convert 1/0 to boolean
                auction_end_time: legacyNft.auction_end_time,
                current_bid: legacyNft.current_bid,
                highest_bidder: legacyNft.highest_bidder,
                royalty_percentage: legacyNft.royalty_percentage || 0,
                nft_collection: legacyNft.collection, // Map 'collection' to 'nft_collection'
                category: legacyNft.category,
                created_at: new Date(legacyNft.created_at),
                updated_at: new Date(legacyNft.updated_at || legacyNft.created_at)
            };
            
            try {
                await NFTTemp.create(nftData);
                console.log(`✓ Migrated NFT: ${nftData.name} (Token ID: ${nftData.token_id})`);
            } catch (err) {
                console.log(`✗ Failed to migrate NFT ${nftData.token_id}: ${err.message}`);
            }
        }
        
        // Backup the legacy collection
        console.log('Creating backup of legacy data...');
        await mongoose.connection.db.collection('nfts').rename('nfts_legacy_backup');
        
        // Rename the migrated collection to replace the legacy one
        console.log('Replacing legacy collection with migrated data...');
        await mongoose.connection.db.collection('nfts_individual').rename('nfts');
        
        console.log('✓ Migration completed successfully!');
        console.log(`✓ Migrated ${legacyDoc.nfts.length} NFTs to individual documents`);
        console.log('✓ Legacy data backed up to nfts_legacy_backup collection');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateLegacyData().then(() => {
    console.log('Migration process finished');
    process.exit(0);
}).catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
