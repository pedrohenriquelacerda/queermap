import { Router } from 'express';
import * as locaisController from '../controllers/api/locaisController.js';

const router = Router();

router.get('/locais', locaisController.listar);

export default router;
