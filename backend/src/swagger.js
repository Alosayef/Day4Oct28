import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';

// Absolute path so the route docs are found regardless of the process cwd (e.g. on Vercel)
const routesGlob = path.join(path.dirname(fileURLToPath(import.meta.url)), 'routes', '*.js').replace(/\\/g, '/');

export default swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Customer API',
      version: '1.0.0',
      description: 'CRUD on the customer table plus a natural-language agent endpoint powered by Claude.',
    },
    components: {
      schemas: {
        Customer: {
          type: 'object',
          properties: {
            customer_id: { type: 'integer', example: 1 },
            customername: { type: 'string', example: 'Abdullah Alosayef' },
            location: { type: 'string', example: 'Dammam' },
          },
        },
        CustomerInput: {
          type: 'object',
          required: ['customername', 'location'],
          properties: {
            customername: { type: 'string', example: 'Sara Ahmed' },
            location: { type: 'string', example: 'Riyadh' },
          },
        },
      },
    },
  },
  apis: [routesGlob],
});
