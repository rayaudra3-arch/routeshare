import express, { Router } from 'express';
import { db } from '../db/database.js';
import { stripe } from '../services/payments.js';
import { config } from '../config.js';

export const paymentsRouter = Router();

paymentsRouter.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !config.STRIPE_WEBHOOK_SECRET) return res.status(200).json({ received: true, mode: 'dev' });

  const signature = req.header('stripe-signature');
  if (!signature) return res.status(400).send('Missing Stripe signature');

  try {
    const event = stripe.webhooks.constructEvent(req.body, signature, config.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;
      if (bookingId && session.payment_status === 'paid') {
        db.prepare(`
          UPDATE bookings
          SET match_status = 'Paid', stripe_payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND stripe_checkout_session_id = ?
        `).run(String(session.payment_intent ?? ''), bookingId, session.id);
      }
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).send(`Webhook Error: ${(error as Error).message}`);
  }
});
