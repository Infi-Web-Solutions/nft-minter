import express from 'express';
import { createLoan, getOpenLoans, updateLoanStatus, getUserLoans } from '../controllers/loanController.js';

const router = express.Router();

router.post('/', createLoan);
router.get('/open', getOpenLoans);
router.put('/:loanId', updateLoanStatus);
router.get('/user/:address', getUserLoans);

export default router;
