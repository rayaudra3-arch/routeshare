import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('./data/routeshare.sqlite'),
  JWT_SECRET: z.string().min(24).default('development-secret-change-before-production'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_ESCROW_PRICE_CURRENCY: z.string().default('usd')
});

export const config = schema.parse(process.env);
export const isProduction = config.NODE_ENV === 'production';

if (config.STRIPE_SECRET_KEY?.startsWith('pk_')) {
  throw new Error('STRIPE_SECRET_KEY must be a server-side sk_ key, not a publishable pk_ key.');
}
