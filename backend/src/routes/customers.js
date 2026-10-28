import { Router } from 'express';
import { customers } from '../db.js';

const router = Router();

const validate = (req, res, next) => {
  const { customername, location } = req.body ?? {};
  if (!customername?.trim() || !location?.trim()) {
    return res.status(400).json({ error: 'customername and location are required' });
  }
  next();
};

const idParam = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be an integer' });
  req.id = id;
  next();
};

/**
 * @openapi
 * /api/customers:
 *   get:
 *     tags: [Customers]
 *     summary: Get all customers
 *     parameters:
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Optional case-insensitive name filter
 *     responses:
 *       200:
 *         description: List of customers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Customer' }
 *   post:
 *     tags: [Customers]
 *     summary: Add a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CustomerInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Customer' }
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(req.query.name ? await customers.searchByName(req.query.name) : await customers.list());
  } catch (e) { next(e); }
});

router.post('/', validate, async (req, res, next) => {
  try {
    const { customername, location } = req.body;
    res.status(201).json(await customers.create({ customername: customername.trim(), location: location.trim() }));
  } catch (e) { next(e); }
});

/**
 * @openapi
 * /api/customers/{id}:
 *   get:
 *     tags: [Customers]
 *     summary: Get a customer by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: The customer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Customer' }
 *       404: { description: Not found }
 *   put:
 *     tags: [Customers]
 *     summary: Update a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CustomerInput' }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Customer' }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Customers]
 *     summary: Delete a customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted customer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Customer' }
 *       404: { description: Not found }
 */
router.get('/:id', idParam, async (req, res, next) => {
  try {
    const c = await customers.get(req.id);
    c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
  } catch (e) { next(e); }
});

router.put('/:id', idParam, validate, async (req, res, next) => {
  try {
    const { customername, location } = req.body;
    const c = await customers.update(req.id, { customername: customername.trim(), location: location.trim() });
    c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
  } catch (e) { next(e); }
});

router.delete('/:id', idParam, async (req, res, next) => {
  try {
    const c = await customers.remove(req.id);
    c ? res.json(c) : res.status(404).json({ error: 'Customer not found' });
  } catch (e) { next(e); }
});

export default router;
