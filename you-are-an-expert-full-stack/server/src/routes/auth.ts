import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { contextSchema, loginSchema, registerSchema } from '../utils/validation.js';

export const authRouter = Router();

function publicUser(row: any) {
  const user = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    authorizedRoles: JSON.parse(row.authorized_roles),
    verifiedStatus: row.verified_status,
    walletBalanceCents: row.wallet_balance_cents
  };
  return { user, token: signToken(user) };
}

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  const { name, email, password, role } = req.body;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email is already registered' });

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, authorized_roles, verified_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email, passwordHash, role, JSON.stringify([role]), 'Verified');

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json(publicUser(row));
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email) as any;
  if (!row || !(await bcrypt.compare(req.body.password, row.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json(publicUser(row));
});

authRouter.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id);
  res.json(publicUser(row));
});

authRouter.post('/context', requireAuth, validateBody(contextSchema), (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  const authorizedRoles = JSON.parse(row.authorized_roles);
  if (!authorizedRoles.includes(req.body.role)) return res.status(403).json({ error: 'Role context not authorized' });
  db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.role, req.user!.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id);
  res.json(publicUser(updated));
});
