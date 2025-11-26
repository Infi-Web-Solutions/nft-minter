import express from 'express';
import { registerTransaction, updateTransaction, getTransactionById, getAllTransactions } from '../controllers/transactionController.js';

const router = express.Router();

// Route to get all transactions with optional filtering (must be before /:transactionId)
router.get('/', getAllTransactions);

// Route to create a new transaction
router.post('/', registerTransaction);

// Route to get a specific transaction by ID
router.get('/:transactionId', getTransactionById);

// Route to update a transaction
router.put('/:transactionId', updateTransaction);

export default router;
