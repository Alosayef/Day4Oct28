# Spec 04: Customer deals

Status: **Draft, awaiting approval** (the implementation plan goes in `_plans/` once approved)

## 1. Background

A sales user manages customers (spec 01) but has no way to track the sales opportunities they are working on with each customer. A **deal** is one specific sales opportunity with one customer.

Example: Sunrise Hospital wants 5,000 printed brochures. Priya creates a deal:

- Title: "Brochure printing – Q4"
- Amount: $150,000
- Stage: Lead → Qualified → Proposal → Won / Lost
- Expected close date: 30 Nov

One customer can have many deals over time: brochures this month, ID cards next month. This feature lets a sales user create, view, update and delete deals for their own customers and move them through the sales stages.

## 2. Goals

- A logged-in user can add deals to any of their own customers, and see, edit, move through stages, and delete them, in the UI and through the API.
- A user only ever sees and changes deals that belong to their own customers, never anyone else's.
- A customer can have any number of deals.
- The deal stage always shows where the opportunity stands, and changing it is a one-step action.

## 3. Non-goals

- A pipeline/kanban board, drag and drop, or sales forecasts and reports across all customers. Deals are viewed per customer.
- Deal line items, products, quotes, invoices, or attachments.
- Multiple currencies. All amounts are in US dollars (USD).
- Stage history, audit trail, notes, activities, or reminders for the close date.
- Assigning a deal to a different customer after creation (a deal stays with the customer it was created for).
- Export of deals to Excel (spec 03 is unchanged and does not include deals).
- AI agent tools for deals (no new agent tool in this spec).
- Admin access to deals: the admin dashboard (spec 02) is unchanged.

## 4. Data model

New table `deal`, added by a new migration `backend/db/migrations/003_deals.sql` (idempotent, `IF NOT EXISTS`, like migration 001):

| Column | Type | Notes |
|---|---|---|
| `deal_id` | `SERIAL PRIMARY KEY` | |
| `customer_id` | `INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE` | the customer the deal is with |
| `title` | `VARCHAR(200) NOT NULL` | e.g. "Brochure printing – Q4" |
| `amount` | `NUMERIC(14,2) NOT NULL` | USD, `>= 0` (`CHECK (amount >= 0)`) |
| `stage` | `VARCHAR(20) NOT NULL DEFAULT 'lead'` | one of the values in 4.1 (`CHECK`) |
| `expected_close_date` | `DATE` | optional |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | set on every update |

- Index on `deal(customer_id)`.
- A deal has no owner column of its own. Ownership comes from the customer: a deal belongs to the user who owns its customer (`customer.sales_user_id`). Every deal query joins `customer` and filters on `customer.sales_user_id = $userId` in the SQL itself (section 5.1).
- Deleting a customer deletes its deals (`ON DELETE CASCADE`). The UI's existing delete-customer confirmation mentions this when the customer has deals (section 7).
- No data is migrated; existing customers simply have no deals.

### 4.1 Stages

| Stored value | Label | Kind |
|---|---|---|
| `lead` | Lead | open (default for new deals) |
| `qualified` | Qualified | open |
| `proposal` | Proposal | open |
| `won` | Won | closed |
| `lost` | Lost | closed |

- The normal progression is Lead → Qualified → Proposal → Won or Lost.
- The stage is **not** forced to move strictly forward: a user may set any stage at any time (for example a deal lost at Qualified, or a reopened lost deal). Validation only checks that the value is one of the five above.
- `won` and `lost` are the closed stages; `lead`, `qualified` and `proposal` are the open ones.

### 4.2 Field validation

- `title`: required, trimmed, 1 to 200 characters.
- `amount`: required, a number `>= 0`, at most two decimal places, at most 12 integer digits. Sent and returned as a JSON number.
- `stage`: optional on create (defaults to `lead`); must be one of the stored values in 4.1.
- `expected_close_date`: optional, `YYYY-MM-DD`, a valid calendar date; `null` clears it. A past date is allowed (the user may be recording an old deal).
- Unknown fields are ignored; `deal_id`, `customer_id`, `created_at` and `updated_at` can never be set or changed through the body.

## 5. API

All endpoints require a Bearer token (same middleware as the other customer endpoints). The user id comes only from the verified token.

| Method and path | Description |
|---|---|
| `GET /api/customers/{id}/deals` | Deals of one of the user's customers, newest first (`ORDER BY created_at DESC, deal_id DESC`). |
| `POST /api/customers/{id}/deals` | Create a deal for that customer. Returns `201` with the deal. |
| `GET /api/deals/{dealId}` | One deal. |
| `PUT /api/deals/{dealId}` | Update any of `title`, `amount`, `stage`, `expected_close_date`. Fields not sent keep their value. Returns the updated deal. |
| `DELETE /api/deals/{dealId}` | Delete the deal. Returns the deleted deal, as the customer delete does. |

- Deal shape in responses: `{ deal_id, customer_id, title, amount, stage, expected_close_date, created_at, updated_at }`. `amount` is a number, `expected_close_date` is `YYYY-MM-DD` or `null` (never shifted by time zone).
- `GET /api/customers/{id}/deals` also returns `200 []` for a customer with no deals.
- Errors keep the shape `{ "error": "message" }`:
  - `400` for invalid input (the message names the field) or a non-numeric id.
  - `401` without a valid token.
  - `404` when the customer or deal does not exist **or belongs to another user** (the same response in both cases, so ids of other users' data cannot be probed).

### 5.1 Ownership enforcement

- Creating and listing check the customer through the existing user-scoped `customers.get(id, userId)`; a missing result is a `404` before any deal query runs.
- Reading, updating and deleting a deal run one SQL statement scoped by the owner, for example:
  `SELECT d.* FROM deal d JOIN customer c ON c.customer_id = d.customer_id WHERE d.deal_id = $1 AND c.sales_user_id = $2`
  (update and delete use the same join condition, via `USING` / a subquery). There is no unscoped deal query.
- Customers with no owner (`sales_user_id` NULL) have deals that nobody can reach through the API.

### 5.2 Routing

- Deal-list and create live on the customer router (`/api/customers/{id}/deals`); the per-deal endpoints live on a new router mounted at `/api/deals` behind `requireAuth`.
- The admin token cannot be used for these endpoints to see sales users' deals: the admin owns no customers, so every lookup returns `404` or an empty list.

## 6. Frontend (deals UI)

- Each row in the customer list gets a **Deals** action that opens a deals panel for that customer (a modal or an expandable section, following the existing customer screen style).
- The panel shows the customer's name and a table of its deals: title, amount, stage, expected close date. Newest first. An empty state reads "No deals yet" with the Add deal button.
- **Add deal** opens a form with: Title, Amount ($), Stage (a select, defaulting to Lead), Expected close date (a date input, optional). Client-side checks mirror section 4.2; server errors show in a toast.
- Each deal row has **Edit** (same form, pre-filled) and **Delete** (with a confirmation).
- The stage can also be changed straight from the row (a select or a "move to next stage" control) without opening the edit form.
- Amounts are shown in US dollar format, e.g. `$150,000` (`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`, without trailing `.00` for whole amounts). The date is shown in a readable form such as `30 Nov 2026`.
- The stage is shown as a coloured badge; `won` and `lost` are visually distinct from the open stages (colour is not the only cue: the label text is always shown).
- The panel header shows a small summary for that customer: number of deals, and total amount of **open** deals.
- The delete-customer confirmation says that the customer's deals will also be deleted when the customer has deals. The customer list may show a deal count per customer if the list endpoint already returns it cheaply; this is not required (see decision 5).
- A `401` from any deal call logs the user out as for every other call. The deals UI is not shown to the admin.

## 7. Swagger documentation

- New tag `Deals`. Document all five endpoints with `bearerAuth`, request bodies, the deal schema, and the `400`, `401`, `404` responses.
- Describe the `stage` enum (`lead`, `qualified`, `proposal`, `won`, `lost`) and the amount/date formats in the schema, with the Sunrise Hospital example.

## 8. Configuration and deployment

- One database change: migration `003_deals.sql`, run once against the Render Postgres database before deploying the backend (same process as migrations 001 and 002; document the step in the README).
- No new dependencies, no new environment variables.
- README: add a short "Deals" section (what a deal is, the stages, the endpoints, link to this spec).

## 9. Security requirements

- Deal access is always scoped to the logged-in user through the customer join (section 5.1); a user cannot read, change or delete another user's deals by guessing ids.
- Other users' deals and unknown deals give the same `404`.
- All SQL uses parameters; the stage is checked against the allowed list and by a database `CHECK`.
- The `deal_id` / `customer_id` in the URL must be positive integers, otherwise `400`.
- Titles are free text and are rendered as text by the frontend (no HTML injection).
- Errors that expose database details are not returned to the client (the existing error handler's behaviour is kept).

## 10. Acceptance criteria

1. All deal endpoints return `401` without a token.
2. `POST /api/customers/{id}/deals` with `title`, `amount`, `expected_close_date` creates a deal with stage `lead` and returns `201`; the Sunrise Hospital example ($150,000, 30 Nov) round-trips exactly (`amount` 150000, date `2026-11-30`, no time-zone shift).
3. A customer can have several deals; `GET /api/customers/{id}/deals` returns them newest first, and `[]` when there are none.
4. `PUT /api/deals/{dealId}` can change the stage to each of `lead`, `qualified`, `proposal`, `won`, `lost`, and updates only the fields sent; `updated_at` changes.
5. Invalid input returns `400` with a message: empty or over-long title, negative or non-numeric amount, more than two decimals, unknown stage, malformed or impossible date (`2026-02-30`).
6. User A cannot list, create, read, update or delete deals on user B's customers or deals: every such call returns `404`, and B's data is unchanged.
7. Deleting a deal removes it; deleting a customer removes its deals.
8. The UI lets a user add, edit, change the stage of, and delete a deal from a customer's deals panel, shows amounts as `$150,000`, shows the empty state, shows the open-deals summary, and shows an error toast on failure.
9. The delete-customer confirmation warns when the customer has deals.
10. Swagger UI documents all five endpoints under `Deals`.
11. Migration `003_deals.sql` can be run twice without error, and the deployed Vercel backend passes criteria 1 to 7.

## 11. Decisions

These were chosen to keep the first version small; change them before approval if needed.

1. **Stage flexibility:** any stage can be set at any time (no enforced one-way flow), so mistakes and reopened deals are easy to correct.
2. **Currency:** USD only, stored as `NUMERIC(14,2)`; no currency column.
3. **Customer deletion:** deleting a customer also deletes its deals (`ON DELETE CASCADE`), with a warning in the UI.
4. **Ownership:** a deal inherits its owner from its customer; no `sales_user_id` column on `deal`.
5. **Deal counts in the customer list:** not part of this spec; deals are opened per customer.
6. **Closed deals:** `won` and `lost` deals stay editable and are not locked.
