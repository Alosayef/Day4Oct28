import { Router } from 'express';
import { runAgent } from '../agent.js';

const router = Router();

/**
 * @openapi
 * /api/agent:
 *   post:
 *     tags: [Agent]
 *     summary: Ask a natural-language question about customers
 *     description: >
 *       Claude calls tools (get all, find by name, add, update, delete) against the database.
 *       Try "show all customers", "find Salman" or "add Sara in Riyadh".
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: Get all customers }
 *     responses:
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       200:
 *         description: Agent answer and the tool calls it made
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer: { type: string }
 *                 toolCalls:
 *                   type: array
 *                   items: { type: object }
 */
router.post('/', async (req, res, next) => {
  const { message } = req.body ?? {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set on the server' });
  }
  try {
    res.json(await runAgent(message, req.user.id));
  } catch (e) {
    // An error status here comes from the Anthropic API, not from the caller's session:
    // never forward it as 401/403, or the client would treat it as an expired login.
    if (e?.status) {
      console.error('Anthropic API error:', e.status, e.message);
      return res.status(502).json({ error: `AI service error (${e.status})` });
    }
    next(e);
  }
});

export default router;
