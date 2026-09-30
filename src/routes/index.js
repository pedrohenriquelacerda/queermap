import { Router } from 'express';
import * as homeController from '../controllers/homeController.js';
import * as healthController from '../controllers/healthController.js';
import apiRoutes from './api.js';

const router = Router();

router.get('/', homeController.index);
router.get('/health', healthController.check);
router.use('/api', apiRoutes);

export default router;
