import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  console.log(`applied ${file}`);
}
await pool.end();
