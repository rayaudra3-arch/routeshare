import Stripe from 'stripe';
import { config } from '../config.js';

export const stripe = config.STRIPE_SECRET_KEY
  ? new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover' as any
    })
  : null;

export async function createBookingCheckoutSession(params: {
  bookingId: string;
  riderEmail: string;
  amountCents: number;
  description: string;
}) {
  if (!stripe) {
    return {
      id: `dev_checkout_${params.bookingId}`,
      url: `${config.APP_BASE_URL}/rider?booking=${params.bookingId}&checkout=dev`
    };
  }

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: params.riderEmail,
    success_url: `${config.APP_BASE_URL}/rider?booking=${params.bookingId}&paid=1`,
    cancel_url: `${config.APP_BASE_URL}/rider?booking=${params.bookingId}&cancelled=1`,
    metadata: { bookingId: params.bookingId },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: config.STRIPE_ESCROW_PRICE_CURRENCY,
          unit_amount: params.amountCents,
          product_data: {
            name: 'RouteShare confirmed carpool fare',
            description: params.description
          }
        }
      }
    ]
  });
}

export async function createDriverTransfer(params: { amountCents: number; destinationAccountId?: string; payoutId: string }) {
  if (!stripe || !params.destinationAccountId) {
    return { id: `dev_transfer_${params.payoutId}` };
  }

  return stripe.transfers.create({
    amount: params.amountCents,
    currency: config.STRIPE_ESCROW_PRICE_CURRENCY,
    destination: params.destinationAccountId,
    metadata: { payoutId: params.payoutId }
  });
}
