import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db } from './database.js';
import './migrate.js';

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count > 0) {
  console.log('Seed skipped; users already exist.');
  process.exit(0);
}

const passwordHash = bcrypt.hashSync('Password123!', 12);
const driverId = randomUUID();
const riderId = randomUUID();

db.prepare(`
  INSERT INTO users (id, name, email, password_hash, role, authorized_roles, verified_status)
  VALUES (@id, @name, @email, @passwordHash, @role, @authorizedRoles, 'Verified')
`).run({
  id: driverId,
  name: 'Maya Driver',
  email: 'driver@routeshare.test',
  passwordHash,
  role: 'Driver',
  authorizedRoles: JSON.stringify(['Driver', 'Rider'])
});

db.prepare(`
  INSERT INTO users (id, name, email, password_hash, role, authorized_roles, verified_status)
  VALUES (@id, @name, @email, @passwordHash, @role, @authorizedRoles, 'Verified')
`).run({
  id: riderId,
  name: 'Jordan Rider',
  email: 'rider@routeshare.test',
  passwordHash,
  role: 'Rider',
  authorizedRoles: JSON.stringify(['Rider'])
});

db.prepare(`
  INSERT INTO trips (
    id, driver_id, start_lat, start_lng, start_label, end_lat, end_lng, end_label,
    departure_time, max_capacity, status, base_duration_seconds, base_distance_meters
  ) VALUES (
    @id, @driverId, 41.8781, -87.6298, 'Downtown Chicago', 41.9803, -87.9090, 'O Hare Terminal 2',
    @departureTime, 3, 'Pending', 2160, 28900
  )
`).run({
  id: randomUUID(),
  driverId,
  departureTime: new Date(Date.now() + 60 * 60 * 1000).toISOString()
});

console.log('Seeded demo users: driver@routeshare.test and rider@routeshare.test / Password123!');
