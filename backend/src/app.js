import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import spec from './swagger.js';
import customerRoutes from './routes/customers.js';
import dealRoutes from './routes/deals.js';
import agentRoutes from './routes/agent.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { requireAuth } from './auth.js';

const app = express();

// Allow the frontend origin(s); comma-separated list supported
const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''));
app.use(cors({ origin: origins, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// Swagger UI: assets come from a CDN so nothing in node_modules has to be served
// (swagger-ui-express's static files are not reliably bundled into serverless functions).
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';
app.get('/swagger.json', (_req, res) => res.json(spec));
app.get(['/swagger', '/swagger/'], (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Customer API - Swagger UI</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: '/swagger.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`);
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/deals', requireAuth, dealRoutes);
app.use('/api/agent', requireAuth, agentRoutes);
app.get('/', (_req, res) => res.redirect('/swagger'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;
