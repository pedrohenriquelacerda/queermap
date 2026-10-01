import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { carregarAdmin, exigirLogin, exigirPapelAdmin } from '../middlewares/auth.js';
import { flash } from '../middlewares/flash.js';
import * as sessao from '../controllers/painel/sessaoController.js';
import * as conta from '../controllers/painel/contaController.js';
import * as inicio from '../controllers/painel/inicioController.js';
import * as pessoas from '../controllers/painel/pessoasController.js';

const QUINZE_MINUTOS = 15 * 60 * 1000;

// Tentativas de login: só as que falham contam.
const opcoesLimite = {
  windowMs: QUINZE_MINUTOS,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: sessao.muitasTentativas,
};
// 5 erros por e-mail (vindo do mesmo IP)...
const limitePorConta = rateLimit({
  ...opcoesLimite,
  limit: 5,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '')
      .trim()
      .toLowerCase()}`,
});
// ...e 30 por IP, para quem tenta vários e-mails.
const limitePorIp = rateLimit({ ...opcoesLimite, limit: 30 });

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store'); // nada do painel fica em cache
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.locals.painel = true;
  next();
});
router.use(carregarAdmin);
router.use(flash);

router.get('/entrar', sessao.formulario);
router.post('/entrar', limitePorIp, limitePorConta, sessao.entrar);

// Daqui para baixo, só com login.
router.use(exigirLogin);

router.get('/', inicio.inicio);
router.post('/sair', sessao.sair);
router.get('/conta', conta.formulario);
router.post('/conta', conta.trocarSenha);

const rotasPessoas = Router();
rotasPessoas.use(exigirPapelAdmin);
// Só ids numéricos; o resto cai no 404.
rotasPessoas.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : next('router')));
rotasPessoas.get('/', pessoas.listar);
rotasPessoas.get('/nova', pessoas.nova);
rotasPessoas.post('/', pessoas.criar);
rotasPessoas.get('/:id', pessoas.editar);
rotasPessoas.post('/:id', pessoas.salvar);
rotasPessoas.post('/:id/senha', pessoas.redefinirSenha);
router.use('/pessoas', rotasPessoas);

export default router;
