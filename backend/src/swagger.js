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
    security: [{ bearerAuth: [] }], // default; the public auth endpoints override it with security: []
    tags: [
      { name: 'Auth', description: 'Register and log in to get a token' },
      { name: 'Admin', description: 'Admin login and the users dashboard (admin accounts only)' },
      { name: 'Customers', description: "CRUD on the logged-in user's own customers" },
      { name: 'Agent', description: "Natural-language access to the logged-in user's customers" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token from /api/auth/login or /api/auth/register',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing, invalid or expired token',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string', example: 'Customer not found' } } },
        User: {
          type: 'object',
          properties: {
            user_id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Sara Ahmed' },
            email: { type: 'string', example: 'sara@example.com' },
            role: { type: 'string', example: 'sales' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT, valid for 8 hours' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        AdminUserSummary: {
          allOf: [
            { $ref: '#/components/schemas/User' },
            { type: 'object', properties: { customer_count: { type: 'integer', example: 5 } } },
          ],
        },
        AdminUsersResponse: {
          type: 'object',
          properties: {
            users: { type: 'array', items: { $ref: '#/components/schemas/AdminUserSummary' } },
            totals: {
              type: 'object',
              properties: {
                users: { type: 'integer', example: 12 },
                customers: { type: 'integer', example: 40, description: 'Customers owned by any user' },
                unassigned_customers: { type: 'integer', example: 8, description: 'Legacy customers with no owner' },
              },
            },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            customer_id: { type: 'integer', example: 1 },
            customername: { type: 'string', example: 'Abdullah Alosayef' },
            location: { type: 'string', example: 'Dammam' },
            sales_user_id: { type: 'integer', example: 1, description: 'Owning sales user' },
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
