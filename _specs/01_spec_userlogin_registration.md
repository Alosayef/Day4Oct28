# Spec 01: User registration, login and per-user customers

Status: **Draft, awaiting approval** (the implementation plan goes in `_plans/` once approved)

## 1. Background

The initial version of the application had no authentication: anyone could read and change every customer, and the AI agent had access to the whole `customer` table.

This feature adds user registration and login, and ties each customer to a sales person. A logged-in user can see and manage only their own customers. The REST API, the AI agent and the UI all enforce this.

## 2. Goals

- A new user can register; the role is `sales` by default.
- A registered user can log in and receive a token.
- Each customer belongs to exactly one sales user.
- Only a logged-in user can use the customer and agent endpoints, and only on their own customers.
- The AI agent respects the same access rules as the REST API.
- Access to a customer owned by someone else is denied.
- Swagger UI documents authentication and can be used to test everything.

## 3. Non-goals

- Other roles (admin, manager) and role-based permissions. The `role` column exists but only `sales` is used.
- Password reset, email verification, refresh tokens, social login.
- Sharing or reassigning customers between users.

## 4. Data model

### 4.1 New table `users`

| Column | Type | Notes |
|---|---|---|
| `user_id` | serial, primary key | |
| `name` | varchar, not null | display name |
| `email` | varchar, not null, unique | stored lower-case; used to log in |
| `password_hash` | varchar, not null | bcrypt hash; the plain password is never stored or logged |
| `role` | varchar, not null, default `'sales'` | |
| `created_at` | timestamptz, not null, default `now()` | |

### 4.2 Changes to `customer`

- Add `sales_user_id integer references users(user_id)`.
- Add an index on `sales_user_id`.
- The column is **nullable** during migration (see section 9, open question 1), and new customers must always have it set.

### 4.3 Migration

- A migration script `backend/db/migrations/001_users_and_ownership.sql` creates the table and the column. It is safe to run more than once (`IF NOT EXISTS`).
- It is run manually (`npm run migrate`); the application does not change the schema on startup.

## 5. Authentication

- Passwords are hashed with bcrypt (`bcryptjs`, cost 10).
- Login returns a signed JWT (HS256) valid for 8 hours. Its payload holds `sub` (user_id), `email` and `role`.
- The signing secret comes from the `JWT_SECRET` environment variable. The server refuses to start (or, on Vercel, every authenticated request returns 500) if it is missing.
- Clients send the token as `Authorization: Bearer <token>`.
- A middleware `requireAuth` verifies the token, loads the user id into `req.user`, and answers `401` when the token is missing, malformed or expired.
- Login failures use one generic message ("Invalid email or password") whether the email or the password was wrong.

### 5.1 Endpoints

| Method and path | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | none | Body `{ name, email, password }`. Creates a user with role `sales`. Returns `201` with the user (no hash) and a token, so the user is logged in immediately. |
| `POST /api/auth/login` | none | Body `{ email, password }`. Returns `200` with `{ token, user }`. |
| `GET /api/auth/me` | required | Returns the current user. |

Validation rules:

- `name` is required, at most 100 characters.
- `email` must be a valid format and is compared case-insensitively. A duplicate returns `409`.
- `password` must be at least 8 characters.
- Any other field in the register body, including `role`, is ignored. A client cannot choose its own role.
- Errors use the existing shape `{ "error": "message" }`: `400` invalid input, `401` bad credentials, `409` email already registered.

## 6. Per-user customer access

All `/api/customers` and `/api/agent` endpoints now require authentication. The user id always comes from the verified token, never from the request body, query string or the AI model.

| Endpoint | Behaviour for the logged-in user |
|---|---|
| `GET /api/customers` | Returns only customers where `sales_user_id` equals the user. The `?name=` filter applies within that set. |
| `POST /api/customers` | Creates a customer with `sales_user_id` set to the user. A `sales_user_id` in the body is ignored. |
| `GET /api/customers/{id}` | Returns the customer only if the user owns it. |
| `PUT /api/customers/{id}` | Updates the customer only if the user owns it. |
| `DELETE /api/customers/{id}` | Deletes the customer only if the user owns it. |

Ownership is enforced in the SQL itself (`WHERE customer_id = $1 AND sales_user_id = $2`), not by fetching first and comparing, so there is no window between check and change.

A request for a customer the user does not own returns `404 Customer not found`, the same response as for an id that does not exist. This keeps the existence of other users' customers private. `401` is returned when there is no valid token.

Request and response bodies of the CRUD endpoints are otherwise unchanged. `Customer` responses add `sales_user_id`.

## 7. AI agent

- `POST /api/agent` requires authentication. The user id from the token is passed into the agent for that request.
- All five tools (get all, get by name, add, update, delete) run through the same user-scoped data functions as the REST API. The tool input schemas do **not** include a user id, so the model cannot choose or change whose data it touches.
- `add_customer` assigns the new customer to the logged-in user.
- `update_customer` and `delete_customer` on a customer the user does not own return "Customer not found" to the model.
- The system prompt tells the model it only has access to the current user's customers and must not claim otherwise.
- A request such as "show all customers" returns only that user's customers; "show customer 1" for another user's customer reports not found.

## 8. Frontend

- Login and Register screens (one page with two tabs). On success the token is stored in `localStorage` and the user lands on the customer screen.
- The customer screen and chat panel are shown only when logged in. The top bar shows the user's name and a Logout button; logging out clears the token.
- Every API call sends the `Authorization` header. A `401` response logs the user out and shows the login screen.
- Inline errors for invalid input, wrong credentials and duplicate email.

## 9. Swagger documentation

- Add a `bearerAuth` security scheme (HTTP bearer, JWT), so Swagger UI shows an **Authorize** button.
- Document `POST /api/auth/register`, `POST /api/auth/login` and `GET /api/auth/me` with request and response examples.
- Mark `/api/customers*` and `/api/agent` as requiring `bearerAuth` and document the `401` and `404` responses.
- Add `User`, `AuthResponse` and `Error` schemas and add `sales_user_id` to `Customer`.
- Test flow in Swagger UI: register, copy the token from the response, click Authorize and paste it, then call the customer and agent endpoints.
- The same flow must work with `curl` or any API client.

## 10. Configuration and deployment

- New environment variable `JWT_SECRET` (long random string). Add it to `backend/.env.example` (placeholder only) and to the Vercel backend project.
- New backend dependencies: `bcryptjs`, `jsonwebtoken`. No new frontend dependencies are expected.
- The migration is run once against the database before deploying the new backend.
- CORS is unchanged; the `Authorization` header is allowed by the existing CORS setup.

## 11. Security requirements

- Passwords and hashes are never returned by any endpoint or written to logs.
- SQL uses parameterized queries only.
- No secrets in the repository; `.env` stays ignored.
- Rate limiting on login is out of scope for this spec but noted as a follow-up.

## 12. Acceptance criteria

1. Registering with valid data returns `201`, a token, and a user whose role is `sales`.
2. Registering with a duplicate email (any letter case) returns `409`; a password under 8 characters returns `400`; sending `"role": "admin"` still creates a `sales` user.
3. Logging in with the right credentials returns a token; wrong email or wrong password returns the same `401` message.
4. `GET /api/customers` without a token returns `401`.
5. User A creates a customer; it appears in A's list and not in B's list.
6. User B requesting, updating or deleting A's customer by id gets `404`, and the customer is unchanged.
7. A `sales_user_id` sent in a create or update body has no effect.
8. In the agent, user B asking for all customers sees only B's; asking to update or delete A's customer fails with not found.
9. Swagger UI shows the Authorize button; following the flow in section 9 lets a tester register, authorize and call every endpoint.
10. The frontend shows login first, shows only the logged-in user's customers, and returns to login after Logout or a `401`.
11. The deployed Vercel backend passes criteria 1 to 8 with `JWT_SECRET` set.

## 13. Open questions (need a decision before the plan)

1. **Existing customers.** The 8 current rows have no owner. Options: (a) leave `sales_user_id` NULL, so they are invisible to everyone until assigned (recommended; nothing is lost, and they can be assigned by SQL); (b) assign them all to the first registered user; (c) delete them. Which one?
2. **Denied access status.** This spec returns `404` for another user's customer so its existence is not revealed. Use `403 Forbidden` instead if you prefer an explicit "denied" message.
3. **Token lifetime.** 8 hours with no refresh token. Acceptable?
