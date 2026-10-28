# Customer Hub

- `backend/` – Express + PostgreSQL REST API, Swagger at `/swagger`, Claude agent at `POST /api/agent`
- `frontend/` – React + Vite UI (customer CRUD + chat)

## Run
```
cd backend  && npm install && npm start      # http://localhost:4000/swagger
cd frontend && npm install && npm run dev    # http://localhost:5173
```
Set `ANTHROPIC_API_KEY` in `backend/.env` to enable the agent/chat. CORS origin is `FRONTEND_ORIGIN`.

## Deploy on Vercel
Create two Vercel projects from this repo:

| Project  | Root Directory | Environment variables |
|----------|----------------|-----------------------|
| backend  | `backend`      | `DATABASE_URL`, `ANTHROPIC_API_KEY`, `FRONTEND_ORIGIN` (the frontend's Vercel URL), optional `ANTHROPIC_MODEL` |
| frontend | `frontend`     | `VITE_API_URL` (the backend's Vercel URL, no trailing slash) |

Deploy the backend first, then set `VITE_API_URL` and deploy the frontend. Swagger UI is at `<backend-url>/swagger`.
