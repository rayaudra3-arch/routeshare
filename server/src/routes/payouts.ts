import { Router } from 'express';
import { endOfWeek, formatISO } from 'date-fns';
import { db, tx } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createDriverTransfer } from '../services/payments.js';
import { randomUUID } from 'node:crypto';

export const payoutsRouter = Router();

export async function runWeeklyPayouts(weekEndingDate = formatISO(endOfWeek(new Date(), { weekStartsOn: 1 }), { representation: 'date' })) {
  const rows = db.prepare(`
    SELECT t.driver_id, u.stripe_connect_account_id, SUM(b.fare_amount_cents) as amount_cents, GROUP_CONCAT(b.id) as booking_ids
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN users u ON u.id = t.driver_id
    LEFT JOIN payout_fares pf ON pf.booking_id = b.id
    WHERE b.check_in_status = 'RiderConfirmed' AND b.fare_locked_at IS NOT NULL AND pf.booking_id IS NULL
    GROUP BY t.driver_id
  `).all() as any[];

  const payouts = [];
  for (const row of rows) {
    const payoutId = randomUUID();
    const bookingIds = String(row.booking_ids).split(',');
    tx(() => {
      db.prepare('INSERT INTO payouts (id, driver_id, amount_cents, week_ending_date, payout_status) VALUES (?, ?, ?, ?, ?)').run(
        payoutId,
        row.driver_id,
        row.amount_cents,
        weekEndingDate,
        'Processing'
      );
      for (const bookingId of bookingIds) {
        db.prepare('INSERT INTO payout_fares (payout_id, booking_id) VALUES (?, ?)').run(payoutId, bookingId);
      }
    });

    const transfer = await createDriverTransfer({
      amountCents: row.amount_cents,
      destinationAccountId: row.stripe_connect_account_id,
      payoutId
    });

    db.prepare(`
      UPDATE payouts SET payout_status = 'Paid', stripe_transfer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(transfer.id, payoutId);
    payouts.push(db.prepare('SELECT * FROM payouts WHERE id = ?').get(payoutId));
  }
  return payouts;
}

payoutsRouter.get('/', requireAuth, requireRole('Driver'), (req, res) => {
  const rows = db.prepare('SELECT * FROM payouts WHERE driver_id = ? ORDER BY week_ending_date DESC').all(req.user!.id);
  res.json(rows);
});

payoutsRouter.post('/run-weekly', requireAuth, requireRole('Driver'), async (_req, res) => {
  const payouts = await runWeeklyPayouts();
  res.json({ payouts });
});
