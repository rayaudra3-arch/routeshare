import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { estimateDriverBaseRoute } from '../services/maps.js';
import { createTripSchema } from '../utils/validation.js';

export const tripsRouter = Router();

function serializeTrip(row: any) {
  return {
    id: row.id,
    driverId: row.driver_id,
    startLocation: { lat: row.start_lat, lng: row.start_lng, label: row.start_label },
    endLocation: { lat: row.end_lat, lng: row.end_lng, label: row.end_label },
    departureTime: row.departure_time,
    maxCapacity: row.max_capacity,
    status: row.status,
    baseDurationSeconds: row.base_duration_seconds,
    baseDistanceMeters: row.base_distance_meters,
    acceptedFares: row.accepted_fares ?? 0
  };
}

tripsRouter.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, COUNT(CASE WHEN b.match_status IN ('Accepted', 'Paid') THEN 1 END) as accepted_fares
    FROM trips t
    LEFT JOIN bookings b ON b.trip_id = t.id
    WHERE (? = 'Driver' AND t.driver_id = ?) OR (? = 'Rider')
    GROUP BY t.id
    ORDER BY t.departure_time ASC
  `).all(req.user!.role, req.user!.id, req.user!.role);
  res.json(rows.map(serializeTrip));
});

tripsRouter.post('/', requireAuth, requireRole('Driver'), validateBody(createTripSchema), async (req, res) => {
  const base = await estimateDriverBaseRoute(req.body.startLocation, req.body.endLocation);
  const id = randomUUID();
  db.prepare(`
    INSERT INTO trips (
      id, driver_id, start_lat, start_lng, start_label, end_lat, end_lng, end_label,
      departure_time, max_capacity, status, base_duration_seconds, base_distance_meters
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
  `).run(
    id,
    req.user!.id,
    req.body.startLocation.lat,
    req.body.startLocation.lng,
    req.body.startLocation.label,
    req.body.endLocation.lat,
    req.body.endLocation.lng,
    req.body.endLocation.label,
    req.body.departureTime,
    req.body.maxCapacity,
    base.durationSeconds,
    Math.round(base.distanceMeters)
  );
  res.status(201).json(serializeTrip(db.prepare('SELECT * FROM trips WHERE id = ?').get(id)));
});

tripsRouter.patch('/:id/status', requireAuth, requireRole('Driver'), (req, res) => {
  const status = String(req.body.status ?? '');
  if (!['Pending', 'Active', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid trip status' });
  }
  const result = db.prepare('UPDATE trips SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND driver_id = ?').run(status, req.params.id, req.user!.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Trip not found' });
  res.json(serializeTrip(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id)));
});
