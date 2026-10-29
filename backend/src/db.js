import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render requires SSL
  max: 3, // small pool: each serverless instance holds its own connections
});

const USER_FIELDS = 'user_id, name, email, role, created_at'; // never includes password_hash

export const users = {
  async create({ name, email, passwordHash }) {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_FIELDS}`,
      [name, email, passwordHash]
    );
    return rows[0];
  },
  /** Includes password_hash: only for login verification. */
  async findByEmailWithHash(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0];
  },
  async findById(id) {
    const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE user_id = $1`, [id]);
    return rows[0];
  },
  /** Admin dashboard: every user with their customer count (0 when none). */
  async listWithCustomerCounts() {
    const { rows } = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.role, u.created_at, COUNT(c.customer_id)::int AS customer_count
       FROM users u LEFT JOIN customer c ON c.sales_user_id = u.user_id
       GROUP BY u.user_id ORDER BY u.created_at DESC`
    );
    return rows;
  },
};

// Every customer query is scoped to the owning sales user (userId), enforced in the SQL itself.
export const customers = {
  /** Count only (no rows): legacy customers that belong to nobody. For the admin totals. */
  async countUnassigned() {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM customer WHERE sales_user_id IS NULL');
    return rows[0].n;
  },
  async list(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM customer WHERE sales_user_id = $1 ORDER BY customer_id',
      [userId]
    );
    return rows;
  },
  async get(id, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM customer WHERE customer_id = $1 AND sales_user_id = $2',
      [id, userId]
    );
    return rows[0];
  },
  async searchByName(name, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM customer WHERE customername ILIKE $1 AND sales_user_id = $2 ORDER BY customer_id',
      [`%${name}%`, userId]
    );
    return rows;
  },
  async create({ customername, location }, userId) {
    const { rows } = await pool.query(
      'INSERT INTO customer (customername, location, sales_user_id) VALUES ($1, $2, $3) RETURNING *',
      [customername, location, userId]
    );
    return rows[0];
  },
  async update(id, { customername, location }, userId) {
    const { rows } = await pool.query(
      `UPDATE customer SET customername = COALESCE($3, customername),
                           location = COALESCE($4, location)
       WHERE customer_id = $1 AND sales_user_id = $2 RETURNING *`,
      [id, userId, customername ?? null, location ?? null]
    );
    return rows[0];
  },
  async remove(id, userId) {
    const { rows } = await pool.query(
      'DELETE FROM customer WHERE customer_id = $1 AND sales_user_id = $2 RETURNING *',
      [id, userId]
    );
    return rows[0];
  },
};
