import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, tx } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { estimateRiderMatch } from '../services/maps.js';
import { createBookingCheckoutSession, stripe } from '../services/payments.js';
import { createBookingSchema, matchDecisionSchema } from '../utils/validation.js';

export const bookingsRouter = Router();

function serializeBooking(row: any) {
  return {
    id: row.id,
    tripId: row.trip_id,
    riderId: row.rider_id,
    riderName: row.rider_name,
    pickupLocation: { lat: row.pickup_lat, lng: row.pickup_lng, label: row.pickup_label },
    dropoffLocation: { lat: row.dropoff_lat, lng: row.dropoff_lng, label: row.dropoff_label },
    fareAmountCents: row.fare_amount_cents,
    matchStatus: row.match_status,
    checkInStatus: row.check_in_status,
    etaPickupTime: row.eta_pickup_time,
    matchScore: row.match_score,
    detourSeconds: row.detour_seconds,
    stripeCheckoutUrl: row.stripe_checkout_url,
    fareLockedAt: row.fare_locked_at
  };
}

bookingsRouter.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, u.name as rider_name
    FROM bookings b
    JOIN users u ON u.id = b.rider_id
    JOIN trips t ON t.id = b.trip_id
    WHERE (? = 'Driver' AND t.driver_id = ?) OR (? = 'Rider' AND b.rider_id = ?)
    ORDER BY b.created_at DESC
  `).all(req.user!.role, req.user!.id, req.user!.role, req.user!.id);
  res.json(rows.map(serializeBooking));
});

bookingsRouter.post('/', requireAuth, requireRole('Rider'), validateBody(createBookingSchema), async (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND status IN (?, ?)').get(req.body.tripId, 'Pending', 'Active') as any;
  if (!trip) return res.status(404).json({ error: 'Open one-way trip not found' });

  const estimate = await estimateRiderMatch({
    start: { lat: trip.start_lat, lng: trip.start_lng, label: trip.start_label },
    end: { lat: trip.end_lat, lng: trip.end_lng, label: trip.end_label },
    pickup: req.body.pickupLocation,
    dropoff: req.body.dropoffLocation,
    departureTime: trip.departure_time,
    baseDurationSeconds: trip.base_duration_seconds,
    baseDistanceMeters: trip.base_distance_meters
  });

  const id = randomUUID();
  db.prepare(`
    INSERT INTO bookings (
      id, trip_id, rider_id, pickup_lat, pickup_lng, pickup_label, dropoff_lat, dropoff_lng, dropoff_label,
      fare_amount_cents, match_status, check_in_status, eta_pickup_time, match_score, detour_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Pending', ?, ?, ?)
  `).run(
    id,
    req.body.tripId,
    req.user!.id,
    req.body.pickupLocation.lat,
    req.body.pickupLocation.lng,
    req.body.pickupLocation.label,
    req.body.dropoffLocation.lat,
    req.body.dropoffLocation.lng,
    req.body.dropoffLocation.label,
    estimate.fareAmountCents,
    estimate.etaPickupTime,
    estimate.matchScore,
    estimate.detourSeconds
  );

  res.status(201).json(serializeBooking(db.prepare('SELECT b.*, u.name as rider_name FROM bookings b JOIN users u ON u.id=b.rider_id WHERE b.id = ?').get(id)));
});

bookingsRouter.post('/decision', requireAuth, requireRole('Driver'), validateBody(matchDecisionSchema), async (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, t.driver_id, t.max_capacity
    FROM bookings b JOIN trips t ON t.id = b.trip_id
    WHERE b.id = ? AND t.driver_id = ?
  `).get(req.body.bookingId, req.user!.id) as any;
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.match_status !== 'Pending') return res.status(409).json({ error: 'Booking already decided' });

  const acceptedCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE trip_id = ? AND match_status IN (?, ?)').get(booking.trip_id, 'Accepted', 'Paid') as any;
  if (req.body.decision === 'Accepted' && acceptedCount.count >= booking.max_capacity) {
    return res.status(409).json({ error: 'Trip capacity is already full' });
  }

  db.prepare('UPDATE bookings SET match_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.decision, req.body.bookingId);

  let checkoutUrl: string | null = null;
  if (req.body.decision === 'Accepted') {
    const rider = db.prepare('SELECT email FROM users WHERE id = ?').get(booking.rider_id) as any;
    const session = await createBookingCheckoutSession({
      bookingId: booking.id,
      riderEmail: rider.email,
      amountCents: booking.fare_amount_cents,
      description: `${booking.pickup_label} to ${booking.dropoff_label}`
    });
    checkoutUrl = session.url ?? null;
    db.prepare('UPDATE bookings SET stripe_checkout_session_id = ?, stripe_checkout_url = ? WHERE id = ?').run(session.id, checkoutUrl, booking.id);
  }

  const updated = db.prepare('SELECT b.*, u.name as rider_name FROM bookings b JOIN users u ON u.id=b.rider_id WHERE b.id = ?').get(req.body.bookingId);
  res.json({ booking: serializeBooking(updated), checkoutUrl });
});

bookingsRouter.post('/:id/rider-check-in', requireAuth, requireRole('Rider'), (req, res) => {
  const payableStatus = stripe ? 'Paid' : 'Accepted';
  const result = db.prepare(`
    UPDATE bookings
    SET check_in_status = 'RiderInitiated', rider_check_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND rider_id = ? AND match_status = ? AND check_in_status = 'Pending'
  `).run(req.params.id, req.user!.id, payableStatus);
  if (result.changes === 0) {
    return res.status(409).json({ error: stripe ? 'Payment must be completed before rider check-in' : 'Rider check-in is not available for this fare' });
  }
  res.json(serializeBooking(db.prepare('SELECT b.*, u.name as rider_name FROM bookings b JOIN users u ON u.id=b.rider_id WHERE b.id = ?').get(req.params.id)));
});

bookingsRouter.post('/:id/driver-check-in', requireAuth, requireRole('Driver'), (req, res) => {
  const result = db.prepare(`
    UPDATE bookings
    SET check_in_status = 'DriverChecked', driver_check_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND check_in_status = 'RiderInitiated' AND trip_id IN (SELECT id FROM trips WHERE driver_id = ?)
  `).run(req.params.id, req.user!.id);
  if (result.changes === 0) return res.status(409).json({ error: 'Driver verification requires rider initiation first' });
  res.json(serializeBooking(db.prepare('SELECT b.*, u.name as rider_name FROM bookings b JOIN users u ON u.id=b.rider_id WHERE b.id = ?').get(req.params.id)));
});

bookingsRouter.post('/:id/rider-confirm', requireAuth, requireRole('Rider'), (req, res) => {
  const booking = tx(() => {
    const result = db.prepare(`
      UPDATE bookings
      SET check_in_status = 'RiderConfirmed', rider_confirmed_at = CURRENT_TIMESTAMP, fare_locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND rider_id = ? AND check_in_status = 'DriverChecked' AND fare_locked_at IS NULL
    `).run(req.params.id, req.user!.id);
    if (result.changes === 0) return null;
    const row = db.prepare('SELECT b.*, t.driver_id, u.name as rider_name FROM bookings b JOIN trips t ON t.id=b.trip_id JOIN users u ON u.id=b.rider_id WHERE b.id = ?').get(req.params.id) as any;
    db.prepare('UPDATE users SET wallet_balance_cents = wallet_balance_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.fare_amount_cents, row.driver_id);
    return row;
  });
  if (!booking) return res.status(409).json({ error: 'Rider confirmation requires driver verification first' });
  res.json(serializeBooking(booking));
});
