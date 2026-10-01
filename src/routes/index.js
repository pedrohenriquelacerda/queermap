import { Router } from 'express';
import { env } from '../config/env.js';
import * as homeController from '../controllers/homeController.js';
import * as healthController from '../controllers/healthController.js';
import * as paginasController from '../controllers/paginasController.js';
import apiRoutes from './api.js';

const router = Router();

router.get('/', homeController.index);
router.get('/sobre', paginasController.sobre);
router.get('/canais-de-denuncia', paginasController.canais);
router.get('/privacidade', paginasController.privacidade);
router.get('/health', healthController.check);
router.use('/api', apiRoutes);

if (!env.isProduction) {
  router.get('/dev/componentes', (req, res) =>
    res.render('dev/componentes', { title: 'Componentes' }),
  );
}

export default router;
