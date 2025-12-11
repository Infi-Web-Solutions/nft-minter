import express from 'express';
import { getPublicConfig } from '../controllers/configController.js';

const router = express.Router();

// GET /api/config - Get public configuration
router.get('/', getPublicConfig);

export default router;
