import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import * as homeController from '../controllers/homeController.js';
import * as healthController from '../controllers/healthController.js';
import * as paginasController from '../controllers/paginasController.js';
import * as locaisController from '../controllers/locaisController.js';
import * as enviosController from '../controllers/enviosController.js';
import painelRoutes from './painel.js';

const router = Router();

// Envios do público: além do limite por e-mail, um limite por IP contra abuso.
const limite = (minutos, limit) =>
  rateLimit({
    windowMs: minutos * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => {
      const erro = new Error('Muitos envios seguidos. Aguarde um pouco e tente de novo.');
      erro.status = 429;
      next(erro);
    },
  });

// Busca de endereço do mapa: cada consulta vai ao Nominatim, que aceita 1 por segundo
// para o site todo. O limite por IP evita que uma pessoa ocupe a fila.
const limiteBusca = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ erro: 'Muitas buscas seguidas. Aguarde alguns minutos.' }),
});

router.get('/', homeController.index);
router.get('/sobre', paginasController.sobre);
router.get('/canais-de-denuncia', paginasController.canais);
router.get('/privacidade', paginasController.privacidade);
router.get('/health', healthController.check);
router.get('/locais/:slug', locaisController.mostrar);
router.get('/buscar-endereco', limiteBusca, locaisController.buscarEndereco);
router.get('/enviar', enviosController.formulario);
router.post('/enviar', limite(60, 10), enviosController.enviar);
router.get('/enviar/confirmar', enviosController.formularioCodigo);
router.post('/enviar/confirmar', limite(15, 20), enviosController.confirmar);
router.get('/enviar/obrigado', enviosController.obrigado);
router.use('/painel', painelRoutes);

if (!env.isProduction) {
  router.get('/dev/componentes', (req, res) =>
    res.render('dev/componentes', { title: 'Componentes' }),
  );
}

export default router;
