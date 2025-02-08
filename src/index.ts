import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { notes } from './db/schema';

export { RAGWorkflow } from './RAGWorkflow';

const app = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();
app.use(async (c, next) => {
	const db = drizzle(c.env.DB);
	c.set('db', db);
	await next();
});

app.get('/', async (c) => {
	const answer = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
		messages: [
			{
				role: 'user',
				content: 'What is the square root of 9?',
			},
		],
	});

	return c.json(answer);
});

app.post(
	'/',
	zValidator(
		'json',
		z.object({
			text: z.string(),
		}),
	),
	async (c) => {
		const { text } = c.req.valid('json');
		const db = c.get('db');
		const result = await db.insert(notes).values({ text }).returning();
		return c.json(result);
	},
);

export default app;
