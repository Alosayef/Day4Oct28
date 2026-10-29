import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { users } from './db.js';

const TOKEN_TTL = '8h';

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured on the server');
  return process.env.JWT_SECRET;
};

export const hashPassword = (password) => bcrypt.hash(password, 10);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const signToken = (user) =>
  jwt.sign({ email: user.email, role: user.role }, secret(), {
    algorithm: 'HS256',
    subject: String(user.user_id),
    expiresIn: TOKEN_TTL,
  });

/** Verifies the Bearer token and sets req.user = { id, email, role }. */
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
    req.user = { id: Number(payload.sub), email: payload.email, role: payload.role };
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError' || e.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(e); // e.g. missing JWT_SECRET -> 500
  }
}

/** Use after requireAuth. The role is read from the database, not trusted from the token. */
export async function requireAdmin(req, res, next) {
  try {
    const user = await users.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (e) { next(e); }
}
