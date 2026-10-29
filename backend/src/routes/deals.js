import { Router } from 'express';
import { deals } from '../db.js';

const router = Router();

export const STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'];

/** Positive integer from a path segment, or null. */
export const positiveInt = (value) => (/^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null);

const isRealDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * Validates a deal body and copies out only the four editable fields.
 * partial = false (create): title and amount required, stage defaults to 'lead'.
 * partial = true (update): any subset, at least one field.
 * Returns { error } or { value }.
 */
export function parseDealBody(body, { partial }) {
  const b = body ?? {};
  const value = {};

  if (!partial || 'title' in b) {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title || title.length > 200) return { error: 'title is required and must be 1 to 200 characters' };
    value.title = title;
  }
  if (!partial || 'amount' in b) {
    const a = b.amount;
    const cents = typeof a === 'number' ? a * 100 : NaN;
    if (!Number.isFinite(cents) || a < 0 || a >= 1e12 || Math.abs(cents - Math.round(cents)) > 1e-6) {
      return { error: 'amount is required and must be a number >= 0 with at most 2 decimals (up to 12 digits before the decimal point)' };
    }
    value.amount = a;
  }
  if ('stage' in b || !partial) {
    const stage = 'stage' in b ? b.stage : 'lead';
    if (!STAGES.includes(stage)) return { error: `stage must be one of: ${STAGES.join(', ')}` };
    value.stage = stage;
  }
  if ('expected_close_date' in b) {
    if (b.expected_close_date !== null && !isRealDate(b.expected_close_date)) {
      return { error: 'expected_close_date must be a valid date in YYYY-MM-DD format, or null' };
    }
    value.expected_close_date = b.expected_close_date;
  } else if (!partial) {
    value.expected_close_date = null;
  }

  if (partial && Object.keys(value).length === 0) {
    return { error: 'send at least one of: title, amount, stage, expected_close_date' };
  }
  return { value };
}

const dealIdParam = (req, res, next) => {
  const id = positiveInt(req.params.dealId);
  if (!id) return res.status(400).json({ error: 'dealId must be a positive integer' });
  req.dealId = id;
  next();
};

const notFound = (res) => res.status(404).json({ error: 'Deal not found' });

/**
 * @openapi
 * /api/deals/{dealId}:
 *   get:
 *     tags: [Deals]
 *     summary: Get a deal by id
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       400: { description: Invalid id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       200:
 *         description: The deal
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Deal' }
 *       404: { description: Not found (or the deal belongs to another user's customer) }
 *   put:
 *     tags: [Deals]
 *     summary: Update a deal
 *     description: Send any of title, amount, stage and expected_close_date. Fields not sent keep their value; expected_close_date null clears it.
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/DealUpdate' }
 *     responses:
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       400: { description: Invalid input, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       200:
 *         description: Updated deal
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Deal' }
 *       404: { description: Not found (or the deal belongs to another user's customer) }
 *   delete:
 *     tags: [Deals]
 *     summary: Delete a deal
 *     parameters:
 *       - in: path
 *         name: dealId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       400: { description: Invalid id, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 *       200:
 *         description: Deleted deal
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Deal' }
 *       404: { description: Not found (or the deal belongs to another user's customer) }
 */
router.get('/:dealId', dealIdParam, async (req, res, next) => {
  try {
    const d = await deals.get(req.dealId, req.user.id);
    d ? res.json(d) : notFound(res);
  } catch (e) { next(e); }
});

router.put('/:dealId', dealIdParam, async (req, res, next) => {
  try {
    const { error, value } = parseDealBody(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const d = await deals.update(req.dealId, value, req.user.id);
    d ? res.json(d) : notFound(res);
  } catch (e) { next(e); }
});

router.delete('/:dealId', dealIdParam, async (req, res, next) => {
  try {
    const d = await deals.remove(req.dealId, req.user.id);
    d ? res.json(d) : notFound(res);
  } catch (e) { next(e); }
});

export default router;
