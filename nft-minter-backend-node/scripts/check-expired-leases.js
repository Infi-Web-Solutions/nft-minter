import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';
import mongoose from 'mongoose';
import WrappedNft from '../src/models/wrappedNft.js';

// Configure dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const API_URL = 'http://localhost:5000/api/wrapped-leasing';

const checkExpired = async () => {
    await connectDB();

    console.log('Listing non-Unwrapped wrapped NFTs...');
    const active = await WrappedNft.find({ status: { $ne: 'Unwrapped' } });

    console.log(`Found ${active.length} non-Unwrapped wrapped NFTs.`);

    for (const nft of active) {
        try {
            console.log(`\nwId: ${nft.wId}`);
            console.log(`- DB Owner (Original): ${nft.owner}`);
            console.log(`- DB Renter: ${nft.renter}`);
            console.log(`- Valid until: ${nft.validUntil}`);

            // Check canUnwrap via API
            try {
                const urlOriginal = `${API_URL}/can-unwrap/${nft.wId}?userAddress=${nft.owner}`;
                const resOriginal = await axios.get(urlOriginal);
                console.log(`- Can Unwrap (Original Owner):`, resOriginal.data.canUnwrap);
                if (!resOriginal.data.canUnwrap) {
                    console.log(`  Reason:`, resOriginal.data.error || 'Unknown');
                }
            } catch (err) {
                console.error(`- Error checking original owner:`, err.response?.data || err.message);
            }

            try {
                const urlRenter = `${API_URL}/can-unwrap/${nft.wId}?userAddress=${nft.renter}`;
                const resRenter = await axios.get(urlRenter);
                console.log(`- Can Unwrap (Renter):`, resRenter.data.canUnwrap);
                if (!resRenter.data.canUnwrap) {
                    console.log(`  Reason:`, resRenter.data.error || 'Unknown');
                }
            } catch (err) {
                console.error(`- Error checking renter:`, err.response?.data || err.message);
            }

        } catch (e) {
            console.error(`Error processing wId ${nft.wId}:`, e.message);
        }
    }

    process.exit(0);
};

checkExpired();
