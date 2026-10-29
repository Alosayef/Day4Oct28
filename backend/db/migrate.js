import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  console.log(`applied ${file}`);
}

// Seed the default admin (spec 02). Never overwrites an existing admin or its password.
// The default password is a lab convenience; set ADMIN_DEFAULT_PASSWORD for real deployments.
const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || '123456789';
const seeded = await pool.query(
  `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email) DO NOTHING RETURNING user_id`,
  ['Administrator', 'admin@admin.com', await hashPassword(adminPassword)]
);
console.log(seeded.rowCount ? 'created admin@admin.com' : 'admin@admin.com already exists');

await pool.end();
