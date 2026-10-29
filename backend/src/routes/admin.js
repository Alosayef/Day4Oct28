import { Router } from 'express';
import { users, customers } from '../db.js';
import { verifyPassword, signToken, requireAuth, requireAdmin } from '../auth.js';

const router = Router();

const publicUser = ({ user_id, name, email, role, created_at }) => ({ user_id, name, email, role, created_at });

/**
 * @openapi
 * /api/admin/login:
 *   post:
 *     tags: [Admin]
 *     summary: Admin login
 *     description: Only accounts with role `admin` can log in here. Any other account gets the same 401 as a wrong password.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: admin@admin.com }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Logged in as admin
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
    // Password is checked before the role so the response does not reveal which part failed
    if (!user || !(await verifyPassword(password, user.password_hash)) || user.role !== 'admin') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users with their customer counts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users (newest first) and totals
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminUsersResponse' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/users', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [list, unassigned] = await Promise.all([users.listWithCustomerCounts(), customers.countUnassigned()]);
    res.json({
      users: list,
      totals: {
        users: list.length,
        customers: list.reduce((sum, u) => sum + u.customer_count, 0),
        unassigned_customers: unassigned,
      },
    });
  } catch (e) { next(e); }
});

export default router;
