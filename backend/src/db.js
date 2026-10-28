import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render requires SSL
  max: 3, // small pool: each serverless instance holds its own connections
});

export const customers = {
  async list() {
    const { rows } = await pool.query('SELECT * FROM customer ORDER BY customer_id');
    return rows;
  },
  async get(id) {
    const { rows } = await pool.query('SELECT * FROM customer WHERE customer_id = $1', [id]);
    return rows[0];
  },
  async searchByName(name) {
    const { rows } = await pool.query(
      'SELECT * FROM customer WHERE customername ILIKE $1 ORDER BY customer_id',
      [`%${name}%`]
    );
    return rows;
  },
  async create({ customername, location }) {
    const { rows } = await pool.query(
      'INSERT INTO customer (customername, location) VALUES ($1, $2) RETURNING *',
      [customername, location]
    );
    return rows[0];
  },
  async update(id, { customername, location }) {
    const { rows } = await pool.query(
      `UPDATE customer SET customername = COALESCE($2, customername),
                           location = COALESCE($3, location)
       WHERE customer_id = $1 RETURNING *`,
      [id, customername ?? null, location ?? null]
    );
    return rows[0];
  },
  async remove(id) {
    const { rows } = await pool.query('DELETE FROM customer WHERE customer_id = $1 RETURNING *', [id]);
    return rows[0];
  },
};
