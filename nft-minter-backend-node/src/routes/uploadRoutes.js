import express from 'express';
import { uploadFileToIPFS } from '../controllers/uploadController.js';
import { testIPFS } from '../controllers/uploadController.js';
const router = express.Router();

// Route to upload file to IPFS
router.post('/ipfs/', uploadFileToIPFS);


router.get('/test-ipfs', testIPFS);

export default router;
