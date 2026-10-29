# Customer Hub

- `backend/` – Express + PostgreSQL REST API, Swagger at `/swagger`, Claude agent at `POST /api/agent`
- `frontend/` – React + Vite UI (customer CRUD + chat)

## Run
```
cd backend  && npm install && npm start      # http://localhost:4000/swagger
cd frontend && npm install && npm run dev    # http://localhost:5173
```
Set `ANTHROPIC_API_KEY` in `backend/.env` to enable the agent/chat. CORS origin is `FRONTEND_ORIGIN`.

## Authentication and per-user customers
Users register (role `sales`) and log in; each customer belongs to one user, and a user only sees and changes their own customers, including through the AI agent. Spec: `_specs/01_spec_userlogin_registration.md`.

Setup: set `JWT_SECRET` in `backend/.env` (a long random string), then create the tables once with `cd backend && npm run migrate`. Customers that existed before this feature have no owner and are not visible to anyone until assigned, e.g. `UPDATE customer SET sales_user_id = <user_id> WHERE sales_user_id IS NULL;`.

Try it in Swagger UI (`/swagger`):
1. `POST /api/auth/register` (or `/api/auth/login`) and copy the `token` from the response.
2. Click **Authorize**, paste the token, and call `/api/customers` and `/api/agent`.

The same works with curl: `curl -H "Authorization: Bearer <token>" http://localhost:4000/api/customers`.

## Admin dashboard
A separate admin login lists every user and how many customers each one has (read-only). Spec: `_specs/02_spec_admin_login.md`.

- `npm run migrate` creates the admin `admin@admin.com` (only if it does not exist yet) with the password `123456789`, or the value of `ADMIN_DEFAULT_PASSWORD` if set. **The default password is public; set `ADMIN_DEFAULT_PASSWORD` before migrating any real deployment.**
- In the app, click **Admin login** on the login page. Admin accounts cannot use the sales login, and sales accounts cannot use the admin login.
- Swagger: `POST /api/admin/login`, authorize with the token, then `GET /api/admin/users`.

## Deploy on Vercel
Create two Vercel projects from this repo:

| Project  | Root Directory | Environment variables |
|----------|----------------|-----------------------|
| backend  | `backend`      | `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `FRONTEND_ORIGIN` (the frontend's Vercel URL), optional `ANTHROPIC_MODEL` |
| frontend | `frontend`     | `VITE_API_URL` (the backend's Vercel URL, no trailing slash) |

Deploy the backend first, then set `VITE_API_URL` and deploy the frontend. Swagger UI is at `<backend-url>/swagger`.
