CREATE TABLE IF NOT EXISTS users (
  user_id       SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'sales',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS sales_user_id INTEGER REFERENCES users(user_id);

CREATE INDEX IF NOT EXISTS idx_customer_sales_user_id ON customer(sales_user_id);
