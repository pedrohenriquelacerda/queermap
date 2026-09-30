import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const require = createRequire(import.meta.url);
const leafletDist = path.dirname(require.resolve('leaflet'));

const OSM_TILES = 'https://tile.openstreetmap.org';

export function createApp({ sessionStore } = {}) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(import.meta.dirname, 'views'));
  app.set('trust proxy', env.trustProxy);

  app.locals.siteName = 'Mapa SerQueer';

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', OSM_TILES],
        },
      },
    }),
  );

  app.use(express.static(path.join(import.meta.dirname, 'public')));
  app.use('/vendor/leaflet', express.static(leafletDist));

  // Depois dos arquivos estáticos, para não contar CSS/JS/imagens no limite.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
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
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
