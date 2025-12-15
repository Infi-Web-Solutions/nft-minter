
import dotenv from 'dotenv';
const result = dotenv.config();
// console.log('Dotenv config result:', result);
// console.log('PINATA_JWT after dotenv:', process.env.PINATA_JWT);

import mongoose from 'mongoose';
import app from './app.js';
import loanAutoLiquidationService from './services/loanAutoLiquidationService.js';
import wrappedLeasingRoutes from './routes/wrappedLeasingRoutes.js';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nft-minter';

console.log('Connecting to MongoDB at:', MONGODB_URI);

// Register routes before starting server
app.use('/api/wrapped-leasing', wrappedLeasingRoutes);

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(async () => {
    console.log('MongoDB connected');
    
    // Initialize and start the loan auto-liquidation service
    try {
        await loanAutoLiquidationService.initialize();
        loanAutoLiquidationService.start();
        console.log('Loan auto-liquidation service started');
    } catch (error) {
        console.error('Failed to start auto-liquidation service:', error.message);
        // Don't fail the server startup if this service fails
    }
    
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Wrapped Leasing API available at: http://localhost:${PORT}/api/wrapped-leasing`);
    });
})
.catch(err => {
    console.error('MongoDB connection error:', err);
});
