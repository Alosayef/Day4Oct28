-- Spec 02: restrict roles to sales/admin. The admin row itself is seeded by migrate.js (needs bcrypt).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('sales', 'admin'));
