import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import spec from './swagger.js';
import customerRoutes from './routes/customers.js';
import agentRoutes from './routes/agent.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Allow the frontend origin(s); comma-separated list supported
const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',');
app.use(cors({ origin: origins }));
app.use(express.json());

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(spec));
app.use('/api/customers', customerRoutes);
app.use('/api/agent', agentRoutes);
app.get('/', (_req, res) => res.redirect('/swagger'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}  (Swagger: /swagger)`));
