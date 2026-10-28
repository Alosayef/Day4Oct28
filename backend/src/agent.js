import Anthropic from '@anthropic-ai/sdk';
import { customers } from './db.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_TURNS = 8;

const tools = [
  {
    name: 'get_all_customers',
    description: 'Return every customer in the database.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_customer_by_name',
    description: 'Find customers whose name contains the given text (case-insensitive).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Full or partial customer name' } },
      required: ['name'],
    },
  },
  {
    name: 'add_customer',
    description: 'Add a new customer.',
    input_schema: {
      type: 'object',
      properties: { customername: { type: 'string' }, location: { type: 'string' } },
      required: ['customername', 'location'],
    },
  },
  {
    name: 'update_customer',
    description: 'Update a customer by id. Look the customer up first if only the name is known.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'integer' },
        customername: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'delete_customer',
    description: 'Delete a customer by id. Look the customer up first if only the name is known.',
    input_schema: {
      type: 'object',
      properties: { customer_id: { type: 'integer' } },
      required: ['customer_id'],
    },
  },
];

const notFound = (r) => r ?? { error: 'Customer not found' };

const handlers = {
  get_all_customers: () => customers.list(),
  get_customer_by_name: ({ name }) => customers.searchByName(name),
  add_customer: (input) => customers.create(input),
  update_customer: ({ customer_id, ...rest }) => customers.update(customer_id, rest).then(notFound),
  delete_customer: ({ customer_id }) => customers.remove(customer_id).then(notFound),
};

const SYSTEM =
  'You are an assistant for a customer database (fields: customer_id, customername, location). ' +
  'Use the provided tools to read or change data; never invent records. Keep answers concise.';

let client;

/** Runs the tool-use loop. Returns { answer, toolCalls }. */
export async function runAgent(message, history = []) {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  const messages = [...history, { role: 'user', content: message }];
  const toolCalls = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      messages,
    });
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      const answer = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return { answer, toolCalls };
    }

    const results = [];
    for (const block of res.content.filter((b) => b.type === 'tool_use')) {
      let output;
      let isError = false;
      try {
        output = await handlers[block.name](block.input);
      } catch (e) {
        output = { error: e.message };
        isError = true;
      }
      toolCalls.push({ name: block.name, input: block.input });
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(output),
        is_error: isError,
      });
    }
    messages.push({ role: 'user', content: results });
  }
  return { answer: 'Stopped: too many tool-call steps.', toolCalls };
}
