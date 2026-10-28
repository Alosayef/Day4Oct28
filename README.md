# Customer Hub

- `backend/` – Express + PostgreSQL REST API, Swagger at `/swagger`, Claude agent at `POST /api/agent`
- `frontend/` – React + Vite UI (customer CRUD + chat)

## Run
```
cd backend  && npm install && npm start      # http://localhost:4000/swagger
cd frontend && npm install && npm run dev    # http://localhost:5173
```
Set `ANTHROPIC_API_KEY` in `backend/.env` to enable the agent/chat. CORS origin is `FRONTEND_ORIGIN`.
