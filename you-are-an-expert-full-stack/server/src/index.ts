import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import './db/migrate.js';
import { config, isProduction } from './config.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { paymentsRouter } from './routes/payments.js';
import { payoutsRouter } from './routes/payouts.js';
import { tripsRouter } from './routes/trips.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.APP_BASE_URL, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use('/api/payments', paymentsRouter);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'RouteShare API', productionHttpsRequired: isProduction });
});

app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payouts', payoutsRouter);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Unexpected server error' });
});

if (!process.env.VERCEL) {
  app.listen(config.PORT, () => {
    console.log(`RouteShare API listening on http://localhost:${config.PORT}`);
  });
}

export default app;
