# Plan 01: User registration, login and per-user customers

Implements: `_specs/01_spec_userlogin_registration.md` (approved)

## Decisions on the open questions

The spec's recommended defaults were used:

1. Existing customers keep `sales_user_id = NULL`, so they are invisible to every user until assigned by SQL.
2. Access to another user's customer returns `404 Customer not found`.
3. JWT lifetime is 8 hours, with no refresh token.

## Before starting

- Working tree is committed (CLAUDE.md rule).
- Add `JWT_SECRET` to the local `backend/.env` (random 64-character string). The Vercel backend project gets its own value later.

## Steps

### 1. Database migration
- New `backend/db/migrations/001_users_and_ownership.sql`: create `users`, add `customer.sales_user_id` (nullable, FK to `users`), add the index. All statements use `IF NOT EXISTS`.
- New `backend/db/migrate.js` that runs every `.sql` file in that folder in order; add the script `npm run migrate`.
- Run it against the Render database and check the schema.

### 2. Backend dependencies and config
- `npm i bcryptjs jsonwebtoken` in `backend/`.
- `backend/.env.example`: add `JWT_SECRET=` placeholder.

### 3. Data layer (`backend/src/db.js`)
- Add `users` helpers: `createUser`, `findUserByEmail` (lower-cased), `findUserById`.
- Make every `customers` function take the owner id and scope the SQL by it:
  - `list(userId)`, `get(id, userId)`, `searchByName(name, userId)`
  - `create(data, userId)` inserts `sales_user_id`
  - `update(id, data, userId)` and `remove(id, userId)` use `WHERE customer_id = $1 AND sales_user_id = $2`
- No unscoped customer query remains, so no caller can bypass the check.

### 4. Auth module
- New `backend/src/auth.js`: `hashPassword`, `verifyPassword`, `signToken` (HS256, 8h), and the `requireAuth` middleware (401 on missing, malformed or expired token; sets `req.user = { id, email, role }`).
- Missing `JWT_SECRET` fails loudly (a clear error rather than signing with an empty secret).

### 5. Auth routes (`backend/src/routes/auth.js`)
- `POST /api/auth/register`: validate name, email, password (8+ chars); ignore any `role` in the body; 409 on duplicate email; return `201 { token, user }`.
- `POST /api/auth/login`: one generic 401 message for wrong email or wrong password.
- `GET /api/auth/me`: behind `requireAuth`.
- Never return `password_hash`.
- Mount in `app.js`.

### 6. Protect customer routes
- Apply `requireAuth` to `/api/customers` and `/api/agent` in `app.js`.
- In `routes/customers.js`, pass `req.user.id` to every data call; ignore `sales_user_id` in bodies. Missing or foreign rows return the existing 404.

### 7. AI agent (`backend/src/agent.js`)
- `runAgent(message, userId)`: handlers close over `userId` and call the scoped data functions. Tool input schemas stay without a user id.
- Update the system prompt: only the current user's customers are accessible.
- `routes/agent.js` passes `req.user.id`.

### 8. Swagger (`backend/src/swagger.js` and route docs)
- Add the `bearerAuth` security scheme and the `User`, `AuthResponse` and `Error` schemas; add `sales_user_id` to `Customer`.
- Document the three auth endpoints with examples.
- Add `security: [{ bearerAuth: [] }]` plus 401 and 404 responses to all customer and agent operations.

### 9. Frontend
- `api.js`: keep the token in `localStorage` (wrapped in try/catch), send `Authorization: Bearer`, add `register`, `login`; on a 401 clear the token and call a logout handler.
- New `components/AuthScreen.jsx`: Login and Register tabs with inline errors.
- `App.jsx`: show `AuthScreen` when there is no token, otherwise the existing UI; top bar shows the user's name and a Logout button; clear the customer list on logout.

### 10. Docs and tooling
- Update `README.md`: auth flow, `JWT_SECRET`, `npm run migrate`, the Swagger test flow.

### 11. Verification (maps to the spec's acceptance criteria)
Run locally against the real database with two throwaway users, then delete the test data:
- Register: 201 and role `sales`; duplicate email in different letter case gives 409; short password gives 400; `"role":"admin"` still gives `sales` (criteria 1, 2).
- Login: right and wrong credentials, same 401 message for both failures (3).
- No token gives 401 on customers and agent (4).
- User A creates a customer: it shows in A's list and not in B's (5).
- B reads, updates and deletes A's customer by id: 404, and the row is unchanged (6).
- A `sales_user_id` in the body has no effect (7).
- Agent as B cannot see, update or delete A's customer (8).
- Swagger: `/swagger.json` contains the security scheme and new paths; the Authorize button flow works (9).
- Frontend: build, then check login, logout and 401 handling in the browser (10).

### 12. Commit and deploy
- Commit on `main`, scan for secrets (`JWT_SECRET`, DB password, API keys) before committing.
- Deployment needs the user's action: set `JWT_SECRET` on the Vercel backend project, run the migration (already applied to the shared database in step 1), push, and redeploy. Re-run the API checks from step 11 against the deployed URL (criterion 11).

## Risks and notes

- The migration changes the shared Render database; the added column is nullable and additive, so the currently deployed backend keeps working until the new code goes out.
- Once the new backend is deployed, the existing frontend deployment will get 401s until the new frontend is deployed too; deploy both together.
- bcryptjs is pure JavaScript, which avoids native build problems on Vercel.
- No rate limiting on login (out of scope per the spec).
