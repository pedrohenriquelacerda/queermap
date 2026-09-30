import { Router } from 'express';
import * as homeController from '../controllers/homeController.js';
import * as healthController from '../controllers/healthController.js';

const router = Router();

router.get('/', homeController.index);
router.get('/health', healthController.check);

export default router;
