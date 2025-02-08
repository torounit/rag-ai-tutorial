import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { notes } from './db/schema';
import { eq } from 'drizzle-orm';

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
	'/notes',
	zValidator(
		'json',
		z.object({
			text: z.string(),
		}),
	),
	async (c) => {
		const { text } = c.req.valid('json');
		await c.env.RAG_WORKFLOW.create({ params: { text } });
		return c.text('Created note', 201);
	},
);

app.delete(
	'/notes/:id',
	zValidator(
		'param',
		z.object({
			id: z.preprocess((v) => Number(v), z.number()),
		}),
	),
	async (c) => {
		const { id } = c.req.valid('param');
		console.log(id);
		const db = c.get('db');
		await db.delete(notes).where(eq(notes.id, id)).returning();
		await c.env.VECTORIZE.deleteByIds([id.toString()]);
		return c.status(204);
	},
);

export default app;
