# Plan 04: Customer deals

Implements: `_specs/04_spec_customer_deals.md` (draft; implement once approved)

## Decisions and corrections

1. The spec's six decisions stand (any stage to any stage, USD only, customer delete cascades to deals, owner inherited from the customer, no deal counts in the customer list, closed deals stay editable).
2. **Migration number:** `002_admin_user.sql` already exists, so the new file is `backend/db/migrations/003_deals.sql`. The spec said `002_deals.sql`; the spec has been corrected to `003`. `migrate.js` runs every `.sql` file in name order on each `npm run migrate`, so the new file must be idempotent.
3. **Delete-customer warning without deal counts:** the customer list does not carry a deal count, so before showing the delete confirmation the frontend calls `GET /api/customers/{id}/deals` and adds "and its N deals" to the message when N > 0. If that call fails, the plain confirmation is shown.

## Before starting

- Working tree is committed (CLAUDE.md rule), including the spec correction above and this plan.
- Backend `.env` points at the Render Postgres database; the migration runs there.
- No new dependencies, no new environment variables.

## Steps

### 1. Migration (`backend/db/migrations/003_deals.sql`)
```sql
CREATE TABLE IF NOT EXISTS deal (
  deal_id             SERIAL PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  title               VARCHAR(200) NOT NULL,
  amount              NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  stage               VARCHAR(20) NOT NULL DEFAULT 'lead'
                      CHECK (stage IN ('lead','qualified','proposal','won','lost')),
  expected_close_date DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_customer_id ON deal(customer_id);
```
- `CREATE ... IF NOT EXISTS` makes a second `npm run migrate` a no-op (criterion 11). The inline `CHECK`s are created with the table, so they are not re-added on later runs.
- Run `npm run migrate` locally against the real database; check the `deal` table, constraints and index.

### 2. Data access (`backend/src/db.js`)
Add a `deals` object next to `customers`. All deal access is scoped to the owner in the SQL, via the customer join.

- A shared column list that fixes the two driver pitfalls:
  `deal_id, customer_id, title, amount::float8 AS amount, stage, to_char(expected_close_date, 'YYYY-MM-DD') AS expected_close_date, created_at, updated_at`
  - `NUMERIC` comes back from `pg` as a string; `::float8` returns a JSON number (12 integer digits + 2 decimals is under the 15-digit float precision).
  - `DATE` comes back from `pg` as a JS `Date` in the server's time zone, which would shift the day; `to_char` returns `YYYY-MM-DD` exactly (acceptance criterion 2).
- `listByCustomer(customerId, userId)`: `... FROM deal d JOIN customer c ON c.customer_id = d.customer_id WHERE d.customer_id = $1 AND c.sales_user_id = $2 ORDER BY d.created_at DESC, d.deal_id DESC`.
- `create(customerId, { title, amount, stage, expected_close_date }, userId)`: a single `INSERT INTO deal (...) SELECT $2, $3, $4, $5, $6 FROM customer WHERE customer_id = $1 AND sales_user_id = $7 RETURNING ...`, so ownership is checked in the same statement and an unowned/other user's customer inserts nothing (returns `undefined` → route sends `404`).
- `get(dealId, userId)`: join as above with `d.deal_id = $1 AND c.sales_user_id = $2`.
- `update(dealId, fields, userId)`: `UPDATE deal d SET ... FROM customer c WHERE d.customer_id = c.customer_id AND d.deal_id = $1 AND c.sales_user_id = $2 RETURNING ...`.
  - `title`, `amount`, `stage` use `COALESCE($n, d.col)` (not sent = keep).
  - `expected_close_date` must be clearable with `null`, which `COALESCE` cannot express, so pass a boolean: `expected_close_date = CASE WHEN $n THEN $m::date ELSE d.expected_close_date END` (`$n` = "the field was sent").
  - `updated_at = now()` always.
  - `RETURNING` needs the same column list; qualify columns with `d.` where `customer` is joined.
- `remove(dealId, userId)`: `DELETE FROM deal d USING customer c WHERE d.customer_id = c.customer_id AND d.deal_id = $1 AND c.sales_user_id = $2 RETURNING ...`.
- There is no function that queries `deal` without the owner id.

### 3. Validation helper (`backend/src/routes/deals.js`, exported for the customer router)
One `parseDealBody(body, { partial })` returning `{ error }` or `{ value }`:
- `title`: string, trimmed, 1 to 200 chars.
- `amount`: a finite JSON number `>= 0`, at most two decimals (`Math.round(x * 100) === x * 100` style check on the number, avoiding float noise), at most 12 integer digits. Strings are rejected.
- `stage`: one of the five values; default `lead` on create only.
- `expected_close_date`: `null`, or a string matching `^\d{4}-\d{2}-\d{2}$` that round-trips through `new Date(Date.UTC(...))` (rejects `2026-02-30`).
- `partial: true` (PUT) accepts any subset; `partial: false` (POST) requires `title` and `amount`. A PUT with none of the four fields returns `400`.
- Only these four keys are copied out of the body, so `deal_id`, `customer_id` and the timestamps cannot be set. Error messages name the field, like the existing `{ error: 'customername and location are required' }` style.

### 4. Routes
- **`backend/src/routes/deals.js`** (new, mounted in `app.js` as `app.use('/api/deals', requireAuth, dealRoutes)`):
  - `GET /:dealId`, `PUT /:dealId`, `DELETE /:dealId`.
  - A `dealIdParam` middleware like `idParam`, but requires a **positive** integer (`400` otherwise).
  - `404 { error: 'Deal not found' }` when the db function returns nothing (missing and other-user cases are the same response).
  - Errors go to `next(e)`; the existing error handler is unchanged.
- **`backend/src/routes/customers.js`**: add `GET /:id/deals` and `POST /:id/deals` after the existing `/:id` routes.
  - Reuse `idParam`, and add a positive-integer check for the customer id.
  - `GET`: first `customers.get(req.id, req.user.id)` → `404 { error: 'Customer not found' }` if missing, then `deals.listByCustomer`. Returns `200 []` for no deals.
  - `POST`: `parseDealBody` → `400`; then `deals.create(...)`; if nothing is inserted, `404 Customer not found`; otherwise `201`.
  - No route conflict: `/export` is still registered before `/:id`, and `/:id/deals` has an extra segment.
- The admin token hits the same code: the admin owns no customers, so every lookup returns `404` or `[]` (spec 5.2). No special casing.

### 5. Swagger
- `swagger.js`: add the `Deals` tag; schemas `Deal` (all response fields, `stage` enum, `amount` number in USD, `expected_close_date` `string`/`format: date`, nullable, example: "Brochure printing – Q4", 150000, `lead`, `2026-11-30`) and `DealInput` (`title`, `amount` required; `stage`, `expected_close_date` optional). For PUT, document that every field is optional.
- JSDoc blocks: `routes/deals.js` for the three per-deal endpoints, `routes/customers.js` for `GET`/`POST /{id}/deals`. Each with `bearerAuth` (default), `401` via `#/components/responses/Unauthorized`, `400` and `404` responses using the `Error` schema.
- The swagger glob already covers `routes/*.js`, and `vercel.json` `includeFiles: "src/**"` already bundles the new file.

### 6. Frontend
- **`api.js`**: `listDeals(customerId)`, `createDeal(customerId, body)`, `getDeal` not needed by the UI, `updateDeal(id, body)`, `removeDeal(id)`, all via the existing `request` (so `401` logs out).
- **`components/DealsPanel.jsx`** (new): a modal opened for one customer.
  - Props: `customer`, `onClose`, `notify`. Loads deals with `api.listDeals` on mount (loading and error states; stays open on error with a toast).
  - Header: customer name, deal count, and total of **open** deals (`lead`/`qualified`/`proposal`) formatted with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })`, dropping `.00` for whole amounts via `minimumFractionDigits: 0`.
  - Table: Title, Amount, Stage (coloured badge with the text label; closed stages styled distinctly), Expected close (`30 Nov 2026`, formatted from the `YYYY-MM-DD` string by parsing the parts so no time-zone shift happens), Actions.
  - Stage can be changed inline with a `<select>` in the row, which calls `updateDeal(id, { stage })` and refreshes.
  - **Add deal** / **Edit** share one inline form: Title, Amount ($, `type="number" min="0" step="0.01"`), Stage select (default Lead), Expected close date (`type="date"`, clearable). Client checks mirror spec 4.2; server errors go to the toast.
  - Delete: `window.confirm` (same pattern as customers), then `removeDeal`.
  - Empty state: "No deals yet" with the Add deal button.
  - Titles rendered as plain React text (no HTML injection).
  - Close on the Close button and `Escape`.
- **`CustomerTable.jsx`**: new `onDeals` prop and a **Deals** button in the action cell of each non-editing row, next to Edit/Delete.
- **`App.jsx`** (`Dashboard`): `dealsFor` state (the customer whose panel is open), render `<DealsPanel>` when set, pass `onDeals` to `CustomerTable`. Change `remove` to fetch `api.listDeals(c.customer_id)` first and word the confirm as "Delete {name} and its N deals?" when N > 0 (decision 3 above); on a failed lookup fall back to the old message.
- The admin dashboard is untouched, so admins never see the deals UI.
- **`App.css`**: modal overlay/card, form grid, stage badge colours (reusing existing CSS variables; add variables only if no suitable one exists), compact table. Keep the existing look.

### 7. Docs
- `README.md`: a "Deals" section: what a deal is, the five stages, the five endpoints, USD, the new `npm run migrate` step for existing databases, link to the spec.

### 8. Verification (maps to the spec's acceptance criteria)
Run locally against the real database with two throwaway sales users (A and B, each with a customer), then delete all test data (users, their customers and deals):
- No token on each of the five endpoints → `401` (1).
- A creates the Sunrise-style deal (`title`, `amount: 150000`, `expected_close_date: "2026-11-30"`): `201`, stage `lead`, `amount` is the number `150000`, date is exactly `"2026-11-30"` (2). Also create a deal with `amount: 1234.5`.
- Create several deals for one customer; list is newest first; a customer with none returns `[]` (3).
- PUT through all five stages; a PUT with one field leaves the others unchanged; `expected_close_date: null` clears the date; `updated_at` advances (4).
- `400` cases: empty and 201-char title, `-1`, `"abc"`, `10.123`, a 13-digit amount, `"stage": "won2"`, `"2026-02-30"`, `"30/11/2026"`, non-integer and zero/negative ids, empty PUT body (5).
- B calls list/create/get/put/delete against A's customer and deals → `404` each time; A's data unchanged afterwards. Admin token gets `404`/`[]` too (6).
- Delete a deal; delete a customer with deals and confirm its deals are gone from the `deal` table (7).
- Run `npm run migrate` twice with no error (11, first part).
- Frontend: `npm run build` and lint, then check in the browser: open the panel, add/edit/stage-change/delete a deal, `$150,000` formatting, "No deals yet" state, the open-deals summary, a forced failure shows an error toast, a bad token logs out, and the delete-customer message mentions deals (8, 9). If real clicks are unreliable here, use DOM clicks and report the gap.
- `/swagger.json` contains all five paths under `Deals` (10).

### 9. Commit and deploy
- Scan the diff for secrets, then commit on `main` (code in one commit after the plan/spec commit, as with specs 02 and 03).
- Deploy needs the user's action: run `npm run migrate` against the production database **before** the backend redeploys, then push so both Vercel projects redeploy. Re-run checks 1 to 7 against the deployed backend (criterion 11, second part).

## Risks and notes

- **Date shift:** returning `DATE` straight from `pg` would shift the day by the server's time zone; the `to_char` in the column list prevents it. Verification step 2 checks `2026-11-30` exactly.
- **Money as float:** `::float8` is exact for the supported range (up to 12 integer digits, 2 decimals). The database keeps `NUMERIC`, so no precision is lost in storage.
- **Clearing the date:** `COALESCE` cannot set a column to NULL, hence the `CASE WHEN` flag in `update`. It is the one place the SQL differs from the customer pattern.
- **Order of deploy:** the backend code needs the `deal` table; running the migration after deploying would make the deal endpoints return `500` until it is applied.
- **Existing customers:** unowned customers (`sales_user_id` NULL) keep invisible deals, as in the earlier specs.
- **Spec change made while planning:** only the migration file name (`002` → `003`); no behaviour changed.
