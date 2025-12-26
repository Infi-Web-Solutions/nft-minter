
import mongoose from 'mongoose';
import NFT from './src/models/nft.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const nft = await NFT.findOne({ token_id: 4 });
        if (nft) {
            console.log('OWNER:', nft.owner_address);
            console.log('RENTABLE:', nft.is_rentable);
            console.log('LISTED:', nft.is_listed);
        } else {
            console.log('NFT NOT FOUND');
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
check();
