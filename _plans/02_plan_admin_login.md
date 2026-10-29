# Plan 02: Admin login and users dashboard

Implements: `_specs/02_spec_admin_login.md` (approved)

## Decisions on the open questions

1. Default admin password is `123456789`; `ADMIN_DEFAULT_PASSWORD` overrides it when set.
2. The admin login is a link on the login page opening a separate screen (no `/admin` URL).
3. Admin tokens are allowed on the sales endpoints and are scoped to the admin's own (empty) data, so there is no role gate on `/api/customers` or `/api/agent`.

## Before starting

- Working tree is committed (CLAUDE.md rule); work on `main` as in plan 01.
- Optionally add `ADMIN_DEFAULT_PASSWORD` to the local `backend/.env`; without it the default is used.

## Steps

### 1. Database migration
- New `backend/db/migrations/002_admin_user.sql`: add a check constraint `users_role_check` (`role IN ('sales','admin')`). To stay re-runnable, drop it if it exists and add it again (`DROP CONSTRAINT IF EXISTS`, then `ADD CONSTRAINT`).
- Extend `backend/db/migrate.js`: after the SQL files, seed the admin (SQL cannot bcrypt):
  - password = `process.env.ADMIN_DEFAULT_PASSWORD || '123456789'`, hashed with `hashPassword` from `src/auth.js`.
  - `INSERT ... ON CONFLICT (email) DO NOTHING` with name `Administrator`, email `admin@admin.com`, role `admin`, so an existing admin (and its password) is never overwritten.
  - Log whether the admin was created or already existed; never log the password or hash.
- Run it locally against the shared database and check the row and constraint.

### 2. Data layer (`backend/src/db.js`)
- Add `users.listWithCustomerCounts()`: one query, `users u LEFT JOIN customer c ON c.sales_user_id = u.user_id`, `GROUP BY u.user_id`, `COUNT(c.customer_id)::int AS customer_count`, ordered by `created_at DESC`. Selects no `password_hash`.
- Add `customers.countUnassigned()`: `COUNT(*)::int` where `sales_user_id IS NULL` (for `totals.unassigned_customers`). This is the only intentionally unscoped customer query; it returns a count only.
- `users.findByEmailWithHash` already returns the role; confirm it, add nothing if so.

### 3. Auth module (`backend/src/auth.js`)
- Add `requireAdmin` (used after `requireAuth`): loads the user by `req.user.id` with `users.findById` and answers `403 Admin access required` unless the stored role is `admin`. A deleted user gets `401`. The role comes from the database, not the token.

### 4. Admin routes (new `backend/src/routes/admin.js`)
- `POST /api/admin/login`: same validation and generic `401 Invalid email or password` as sales login; additionally fails with that same 401 when the account's role is not `admin`. To avoid a timing difference, still run the bcrypt comparison before the role check. Returns `{ token, user }` using the existing `publicUser` shape.
- `GET /api/admin/users`: behind `requireAuth` and `requireAdmin`; returns `{ users, totals: { users, customers, unassigned_customers } }`. `totals.customers` is the sum of `customer_count`; `totals.users` is the row count.
- Mount in `app.js`: the login route is public, the users route is protected inside the router.

### 5. Separate the sales login (`backend/src/routes/auth.js`)
- `POST /api/auth/login`: after the password check, a user with role `admin` gets the same generic 401.
- `POST /api/auth/register` already forces `sales`; no change.
- `GET /api/auth/me` works for both roles (it already does); no change.
- The customer and agent routes are not changed (decision 3).

### 6. Swagger
- `backend/src/swagger.js`: add the `Admin` tag and the `AdminUserSummary` and `AdminUsersResponse` schemas.
- JSDoc on both admin operations, with examples, `security: []` for login and `bearerAuth` plus 401/403 responses for the users list.
- Note on `/api/auth/login` that admin accounts must use `/api/admin/login`.

### 7. Frontend
- `api.js`: add `adminLogin` and `adminUsers`. Treat a 401 from `/api/admin/login` like the other login calls (shown inline, no forced logout).
- New `components/AdminLogin.jsx`: email and password only, inline error, a "Back to login" link.
- `components/AuthScreen.jsx`: add a small "Admin login" link that switches `App` to `AdminLogin`.
- New `components/AdminDashboard.jsx`: totals above a table (Name, Email, Role, Registered, Customers); loading, empty and error states; a `403` shows "Not authorised" and logs out.
- `App.jsx`: choose the view from `user.role`: `admin` renders `AdminDashboard` (top bar with name and Log out, no customer table or chat), otherwise the existing `Dashboard`. Hold an `adminMode` flag for the pre-login screen.
- Small additions to `App.css` for the dashboard table and totals, reusing existing classes where possible.

### 8. Docs and config
- `backend/.env.example`: add `ADMIN_DEFAULT_PASSWORD=` (commented as optional).
- `README.md`: admin account, how to sign in, the migration/seed behaviour, the insecure-default warning, and the Swagger test flow.

### 9. Verification (maps to the spec's acceptance criteria)
Run locally against the real database, using throwaway sales users that are deleted afterwards:
- Run `npm run migrate` twice: one `admin@admin.com` row, role `admin`, password unchanged on the second run (1).
- `POST /api/admin/login`: right credentials give 200 with role `admin`; wrong password, unknown email and a sales account's credentials give the identical 401 (2).
- `POST /api/auth/login` with the admin credentials gives 401 (3).
- `GET /api/admin/users`: no token 401, sales token 403, admin token 200 (4).
- The returned counts match direct SQL (including a user with 0), no `password_hash`, totals correct (5).
- Add and delete a customer as a sales user; the next admin fetch reflects it (6).
- Admin token on `GET /api/customers` gives an empty list; get, update and delete of a sales user's customer by id give 404 and leave it unchanged (7).
- Register with `"role": "admin"` still creates `sales` (8).
- Swagger: `/swagger.json` includes the admin paths and schemas (10).
- Frontend: `npm run build` and lint, then check in the browser: admin link, admin login, dashboard, logout, a sales user never sees the dashboard (9).

### 10. Commit and deploy
- Scan the diff for secrets before committing (the default password is expected only in `migrate.js` and the spec/plan/README).
- Deployment needs the user's action: set `ADMIN_DEFAULT_PASSWORD` to a non-default value in the environment used for the production migration, run `npm run migrate` against the production database, then push and redeploy backend and frontend together. Re-run checks 1 to 8 against the deployed URL (criterion 11).

## Risks and notes

- The migration seeds a known-password admin. This is a lab decision; production should use the `ADMIN_DEFAULT_PASSWORD` override. If the shared database is already migrated with the default, change that password by hand.
- The role constraint would fail if any existing row has a role other than `sales` or `admin`; check the data before applying (the migration will report the error and change nothing).
- Because the sales endpoints are not role-gated, an admin calling `POST /api/customers` directly creates a customer owned by the admin. The UI never offers this, and it appears on the dashboard as the admin's own count.
- Creating the admin in `migrate.js` imports `src/auth.js`, which needs no `JWT_SECRET` until a token is signed, so the migration does not require it.
- The admin dashboard has no pagination; fine for a lab-size user list.
