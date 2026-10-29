# Spec 02: Admin login and users dashboard

Status: **Draft, awaiting approval** (open questions resolved; the implementation plan goes in `_plans/` once approved)

## 1. Background

Spec 01 added registration and login for `sales` users. Every account in the application today is a sales user, and the `users.role` column only ever holds `sales`.

This feature adds an **admin** who signs in through a separate login, apart from the sales login. The admin gets a dashboard that lists every user of the application and how many customers each one has. The default admin account is `admin@admin.com`.

## 2. Goals

- An admin account exists by default (`admin@admin.com`) and can sign in through its own admin login screen and endpoint.
- The admin sees a dashboard listing all users with the number of customers associated with each.
- Admin and sales sign-ins are separate: a sales user cannot sign in as admin, and an admin account cannot be used through the sales login.
- Admin-only endpoints reject everyone who is not an admin.

## 3. Non-goals

- Admin management of users (create, edit, disable, delete, reset password) or of customers. The dashboard is read-only.
- Viewing or editing individual customers' details (only counts are shown).
- Creating further admins from the UI or API. Admins are created by the seed/migration only.
- Registration of admins through `POST /api/auth/register` (it still always creates `sales`).
- Password reset, MFA, rate limiting (noted as follow-ups, as in spec 01).

## 4. Data model

No new tables. The existing `users.role` column is used with two values: `sales` and `admin`.

- A check constraint limits `role` to `('sales', 'admin')`.
- Migration `backend/db/migrations/002_admin_user.sql` adds the constraint and is safe to run more than once.
- The default admin row is created by the migration script (`npm run migrate`) rather than SQL alone, because the password must be hashed with bcrypt:
  - `name`: `Administrator`
  - `email`: `admin@admin.com`
  - `role`: `admin`
  - `password_hash`: bcrypt of the default password `123456789`, or of `ADMIN_DEFAULT_PASSWORD` when that variable is set (see section 9).
- If the admin row already exists, the migration leaves it unchanged (it never overwrites an existing password).
- The admin has no customers of its own; the UI never offers a way to create any.

## 5. Authentication

- Admin sign-in reuses the spec 01 mechanics: bcrypt password check, JWT (HS256, `JWT_SECRET`), `Authorization: Bearer <token>`.
- The admin token has `role: "admin"` in its payload, and the **role is re-read from the database** by the middleware, so a token cannot grant more than the account has.
- New middleware `requireAdmin` runs after `requireAuth` and answers `403` when the user's role is not `admin`.
- Separation of the two logins:
  - `POST /api/admin/login` accepts only accounts with role `admin`. Any other email or a wrong password returns the same generic `401 Invalid email or password`.
  - `POST /api/auth/login` (sales) rejects accounts with role `admin` with the same generic `401`, so the admin cannot sign in through the sales screen.
- Sales endpoints (`/api/customers`, `/api/agent`) are **not** blocked for admins. They stay scoped to the token's user id as in spec 01, so an admin token gets an empty customer list (the admin owns no customers) and no access to anyone else's.

### 5.1 Endpoints

| Method and path | Auth | Description |
|---|---|---|
| `POST /api/admin/login` | none | Body `{ email, password }`. Returns `200` with `{ token, user }` for an admin account. |
| `GET /api/admin/users` | admin | Returns all users with their customer counts (section 6). |

Errors keep the existing shape `{ "error": "message" }`: `400` invalid input, `401` bad credentials or missing/expired token, `403` valid token but not an admin.

## 6. Dashboard data

`GET /api/admin/users` returns every row of `users`, including the admin, ordered by `created_at` descending:

```json
[
  {
    "user_id": 3,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "sales",
    "created_at": "2026-10-20T09:15:00Z",
    "customer_count": 5
  }
]
```

- `customer_count` is computed in one query (`LEFT JOIN customer ... GROUP BY`), so users with no customers show `0`. It is returned as a number, not a string.
- `password_hash` is never selected or returned.
- Customer rows with a NULL `sales_user_id` (unassigned legacy rows from spec 01) belong to no user and are not counted for anyone. The response also includes a top-level summary, so the response shape is:

```json
{ "users": [ ... ], "totals": { "users": 12, "customers": 40, "unassigned_customers": 8 } }
```

## 7. Frontend

- The login page gets a small "Admin login" link (not a separate URL) that opens a separate admin sign-in screen (email and password only, no register tab).
- On success the admin lands on the **Admin dashboard**: a table of users with columns Name, Email, Role, Registered, Customers, plus the totals above the table. A Logout button and the admin's name appear in the top bar.
- The admin never sees the customer screen or the chat panel; a sales user never sees the dashboard.
- The token is stored in `localStorage` as for sales users. The app decides which view to show from the `role` in the user object returned at login (and on page load from `GET /api/auth/me`, which must work for both roles).
- A `401` logs out; a `403` on the dashboard shows "Not authorised" and returns to login.
- Loading, empty and error states are shown for the table.

## 8. Swagger documentation

- Add an **Admin** tag documenting `POST /api/admin/login` and `GET /api/admin/users` (the latter with `bearerAuth` and the `401`/`403` responses).
- Add `AdminUserSummary` and `AdminUsersResponse` schemas.
- Note on the sales endpoints that an admin token only sees the admin's own (empty) data.
- Test flow: call `POST /api/admin/login`, click Authorize, paste the token, call `GET /api/admin/users`.

## 9. Configuration and deployment

- The default admin password is `123456789` (a lab decision). An optional environment variable `ADMIN_DEFAULT_PASSWORD` overrides it when the migration runs; document it in `backend/.env.example`. Only the bcrypt hash is stored in the database.
- No new dependencies are expected.
- Run `npm run migrate` once against the database before deploying the new backend. The known default password is insecure for a real deployment: set `ADMIN_DEFAULT_PASSWORD` before migrating production. There is no UI to change the password in this spec.

## 10. Security requirements

- Hashes and passwords are never returned or logged. The default password appears only as a fallback in the seed script and this spec.
- Admin checks happen on the server for every admin request; hiding the UI is not relied upon.
- SQL uses parameterized queries only.
- Failed admin logins use the same generic message and status regardless of whether the email exists or is an admin.

## 11. Acceptance criteria

1. After migration, a user `admin@admin.com` with role `admin` exists, and running the migration again does not change it or create a duplicate.
2. `POST /api/admin/login` with the right credentials returns `200`, a token and a user with role `admin`; wrong password, unknown email, or a sales account's credentials return the same `401`.
3. `POST /api/auth/login` with the admin's credentials returns `401`.
4. `GET /api/admin/users` without a token returns `401`; with a sales token returns `403`; with an admin token returns `200`.
5. The response lists every user with the correct `customer_count` (including `0`), no `password_hash`, and correct `totals`.
6. After a sales user adds or deletes a customer, the count on the dashboard reflects it on the next load.
7. An admin token on `/api/customers` returns `200` with an empty list and cannot read, change or delete any sales user's customer (`404`).
8. `POST /api/auth/register` with `"role": "admin"` still creates a `sales` user.
9. The frontend shows the admin sign-in from the login page, shows the dashboard only to admins, and returns to login on Logout or `401`.
10. Swagger UI documents the admin endpoints and the test flow in section 8 works.
11. The deployed Vercel backend passes criteria 1 to 8 after the migration is run (with `ADMIN_DEFAULT_PASSWORD` set to a non-default value).

## 12. Decisions

1. **Default admin password:** `123456789`, overridable with `ADMIN_DEFAULT_PASSWORD`.
2. **Admin login location:** a link on the login page opening a separate screen.
3. **Admin on sales endpoints:** allowed, scoped to the admin's own (empty) data, not `403`.
