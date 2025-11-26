import express from 'express';
import {
    createCollection,
    getAllCollections,
    getCollectionById,
    updateCollection,
    deleteCollection,
    getTrendingCollections,
    getCollectionsByLikes
} from '../controllers/collectionController.js';

const router = express.Router();

// Route to create a new collection
router.post('/', createCollection);

// Route to get all collections
router.get('/', getAllCollections);

// Route to get trending collections
router.get('/trending/', getTrendingCollections);

// Route to get collections by likes
router.get('/by-likes/', getCollectionsByLikes);

// Route to get a specific collection by ID
router.get('/:id', getCollectionById);

// Route to update a collection by ID
router.put('/:id', updateCollection);

// Route to delete a collection by ID
router.delete('/:id', deleteCollection);

export default router;
