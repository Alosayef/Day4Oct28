-- Spec 04: deals (sales opportunities) for a customer. Ownership comes from the customer's sales_user_id.
CREATE TABLE IF NOT EXISTS deal (
  deal_id             SERIAL PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  title               VARCHAR(200) NOT NULL,
  amount              NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  stage               VARCHAR(20) NOT NULL DEFAULT 'lead'
                      CHECK (stage IN ('lead', 'qualified', 'proposal', 'won', 'lost')),
  expected_close_date DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_customer_id ON deal(customer_id);
