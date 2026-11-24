import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import rotas from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { verificarOrigem } from './middlewares/origem.js';
import { carregarAdmin } from './middlewares/auth.js';
import * as fmt from './utils/formatadores.js';

const require = createRequire(import.meta.url);
const leafletDist = path.dirname(require.resolve('leaflet'));
// maplibre-gl 6 só publica ESM (dist/*.mjs); o plugin que o liga ao Leaflet é um UMD.
const maplibreDist = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist');
const maplibreLeafletJs = require.resolve('@maplibre/maplibre-gl-leaflet');
const fontesDir = path.join(
  path.dirname(require.resolve('@fontsource/atkinson-hyperlegible/package.json')),
  'files',
);

// Mapa base: tiles vetoriais do OpenFreeMap (sem ícones de comércio, sem chave de API),
// desenhados pelo MapLibre. Os tiles raster do OpenStreetMap ficam como reserva, para
// navegadores sem WebGL.
const OPENFREEMAP = 'https://tiles.openfreemap.org';
const OSM_TILES = 'https://tile.openstreetmap.org';
const TURNSTILE = 'https://challenges.cloudflare.com';

export function createApp({ sessionStore } = {}) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(import.meta.dirname, 'views'));
  app.set('trust proxy', env.trustProxy);
  // Em produção o Express já guarda os templates em cache; no teste de carga imitamos isso.
  if (env.testeDeCarga) app.enable('view cache');

  app.locals.siteName = 'Mapa SerQueer';
  app.locals.siteUrl = env.siteUrl;
  app.locals.demonstracao = env.demonstracao;
  app.locals.fmt = fmt;
  app.locals.descricaoPadrao =
    'Mapa de espaços de cuidado em saúde para a população LGBTQIA+ de Porto Alegre, ' +
    'validados pela ONG Somos.';

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', OSM_TILES],
          // Cloudflare Turnstile (anti-robô do formulário de envio)
          'script-src': ["'self'", TURNSTILE],
          'frame-src': [TURNSTILE],
          // OpenFreeMap: estilo, fontes, ícones e tiles do mapa (buscados pelo MapLibre)
          'connect-src': ["'self'", TURNSTILE, OPENFREEMAP],
          // O worker do MapLibre vem do próprio site (/vendor/maplibre), sem blob:
          'worker-src': ["'self'"],
        },
      },
      // Provedores de tiles (como o OpenStreetMap) podem bloquear pedidos sem Referer. Enviamos
      // só a origem do site para outros domínios, nunca o caminho da página.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Comprime só os arquivos estáticos (JS, CSS, SVG): o MapLibre sozinho passa de 1,6 MB e cai
  // para cerca de 450 KB. O HTML fica sem compressão, para não gastar CPU a cada página.
  app.use(
    compression({
      filter: (req, res) => /\.(m?js|css|svg)$/.test(req.path) && compression.filter(req, res),
    }),
  );

  app.use(express.static(path.join(import.meta.dirname, 'public')));
  app.use('/vendor/leaflet', express.static(leafletDist));
  app.use('/vendor/maplibre', express.static(maplibreDist, { index: false }));
  app.get('/vendor/maplibre-leaflet/leaflet-maplibre-gl.js', (req, res) =>
    res.sendFile(maplibreLeafletJs),
  );
  app.use('/vendor/fontes', express.static(fontesDir, { maxAge: '1y', immutable: true }));

  // Caminho atual, para marcar o link ativo no menu.
  app.use((req, res, next) => {
    res.locals.caminho = req.path;
    next();
  });

  // Depois dos arquivos estáticos, para não contar CSS/JS/imagens no limite.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      skip: () => env.testeDeCarga,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );

  // Até 5.000 caracteres de notas podem ocupar 45 KB no formulário URL-encoded.
  // Amplia apenas esta rota; o restante mantém o limite original de 20 KB.
  app.post(
    '/painel/envios/:id/notas',
    express.urlencoded({ extended: false, limit: '64kb' }),
    express.json({ limit: '64kb' }),
  );
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));

  app.use(
    session({
      store: sessionStore,
      name: 'queermap.sid',
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      // Expira após 30 min sem uso: cada acesso renova o prazo (rolling)
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        maxAge: 30 * 60 * 1000,
      },
    }),
  );

  app.use(verificarOrigem); // CSRF: envios só a partir do próprio site
  app.use(carregarAdmin);
  app.use((req, res, next) => {
    if (req.admin) res.set('Cache-Control', 'private, no-store');
    next();
  });
  app.use(rotas());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
