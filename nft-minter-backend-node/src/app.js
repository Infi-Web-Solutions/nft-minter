import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import nftRoutes from './routes/nftRoutes.js';
import userRoutes from './routes/userRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({
    createParentPath: true,
    limits: { 
        fileSize: 20 * 1024 * 1024 * 1024 // 20MB max file size
    },
}));

// Routes
app.use('/api/nfts', nftRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/upload', uploadRoutes);

export default app;