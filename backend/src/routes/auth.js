import { Router } from 'express';
import { users } from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = ({ user_id, name, email, role, created_at }) => ({ user_id, name, email, role, created_at });

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new sales user
 *     description: Creates a user with role `sales` (any `role` in the body is ignored) and returns a token.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, maxLength: 100, example: Sara Ahmed }
 *               email: { type: string, format: email, example: sara@example.com }
 *               password: { type: string, minLength: 8, example: changeme123 }
 *     responses:
 *       201:
 *         description: Registered and logged in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!name || name.length > 100) return res.status(400).json({ error: 'name is required (max 100 characters)' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'a valid email is required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

    let user;
    try {
      user = await users.create({ name, email, passwordHash: await hashPassword(password) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Email is already registered' });
      throw e;
    }
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and get a token
 *     description: For sales users (admins use `/api/admin/login`). Copy the returned token, click **Authorize** and paste it to call the protected endpoints.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: sara@example.com }
 *               password: { type: string, example: changeme123 }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = email ? await users.findByEmailWithHash(email) : undefined;
    // Same message whether the email or the password is wrong
    if (!user || !(await verifyPassword(password, user.password_hash)) || user.role === 'admin') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The logged-in user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await users.findById(req.user.id);
    user ? res.json(publicUser(user)) : res.status(401).json({ error: 'Invalid or expired token' });
  } catch (e) { next(e); }
});

export default router;
