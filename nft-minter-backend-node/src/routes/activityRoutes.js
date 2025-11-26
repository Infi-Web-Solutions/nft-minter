import express from 'express';
import {
    getActivities,
    getActivityStats,
    getNotifications
} from '../controllers/activityController.js';

const router = express.Router();

// Route to get all activities with filtering
router.get('/', getActivities);

// Route to get notifications for a user
router.get('/notifications/:walletAddress', getNotifications);

// Route to get activity statistics
router.get('/stats/', getActivityStats);

export default router;
