import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { exigirLogin, exigirPapelAdmin } from '../middlewares/auth.js';
import { flash } from '../middlewares/flash.js';
import * as sessao from '../controllers/painel/sessaoController.js';
import * as conta from '../controllers/painel/contaController.js';
import * as inicio from '../controllers/painel/inicioController.js';
import * as pessoas from '../controllers/painel/pessoasController.js';
import * as locais from '../controllers/painel/locaisController.js';
import * as classificacao from '../controllers/painel/classificacaoController.js';

const QUINZE_MINUTOS = 15 * 60 * 1000;

// Só ids numéricos; o resto cai no 404.
const soNumeros = (req, res, next, valor) => (/^\d+$/.test(valor) ? next() : next('router'));

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
rotasPessoas.param('id', soNumeros);
rotasPessoas.get('/', pessoas.listar);
rotasPessoas.get('/nova', pessoas.nova);
rotasPessoas.post('/', pessoas.criar);
rotasPessoas.get('/:id', pessoas.editar);
rotasPessoas.post('/:id', pessoas.salvar);
rotasPessoas.post('/:id/senha', pessoas.redefinirSenha);
router.use('/pessoas', rotasPessoas);

const rotasLocais = Router();
rotasLocais.param('id', soNumeros);
rotasLocais.get('/', locais.listar);
rotasLocais.get('/novo', locais.novo);
rotasLocais.get('/geocodificar', locais.geocodificar);
rotasLocais.post('/', locais.criar);
rotasLocais.get('/:id', locais.editar);
rotasLocais.post('/:id', locais.salvar);
rotasLocais.post('/:id/:acao', locais.mudarSituacao);
router.use('/locais', rotasLocais);

const rotasClassificacao = Router();
rotasClassificacao.use(exigirPapelAdmin);
rotasClassificacao.param('id', soNumeros);
rotasClassificacao.param('tipo', (req, res, next, tipo) =>
  ['categoria', 'caracteristica'].includes(tipo) ? next() : next('router'),
);
rotasClassificacao.get('/', classificacao.listar);
rotasClassificacao.post('/:tipo', classificacao.criar);
rotasClassificacao.post('/:tipo/:id', classificacao.salvar);
router.use('/classificacao', rotasClassificacao);

export default router;
