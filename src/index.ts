import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { notes } from './db/schema';
import { eq, inArray } from 'drizzle-orm';

export { RAGWorkflow } from './RAGWorkflow';

const app = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();
app.use(async (c, next) => {
	const db = drizzle(c.env.DB);
	c.set('db', db);
	await next();
});
app.get(
	'/',
	zValidator(
		'query',
		z.object({
			question: z.string().optional(),
		}),
	),
	async (c) => {
		const { question } = c.req.valid('query');
		if (!question) {
			return c.json('Please provide a question', 400);
		}

		const embeddings = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
			text: question,
		});
		const vec = embeddings.data[0];

		const query = await c.env.VECTORIZE.query(vec, { topK: 3 });
		const ids = query.matches
			.filter(({ score }) => score > 0.7)
			.map(({ id }) => Number(id))
			.filter((id) => !isNaN(id));

		const fetchedNotes = await c
			.get('db')
			.select()
			.from(notes)
			.where(inArray(notes.id, ids));

		console.log(JSON.stringify(fetchedNotes));

		const contextList = fetchedNotes.map((note) => `- ${note.text}`).join('\n');
		const message = contextList ? `Context: \n${contextList}` : '';

		const answer = await c.env.AI.run(
			'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
			{
				messages: [
					...(message ? [{ role: 'system', content: message }] : []),
					{
						role: 'system',
						content: `When answering the question or responding, use the context provided, if it is provided and relevant.`,
					},
					{
						role: 'user',
						content: question,
					},
				],
			},
		);

		return c.json(answer);
	},
);

app.get('/notes', async (c) => {
	const db = c.get('db');
	const results = await db.select().from(notes);
	return c.json(results);
});

app.post(
	'/notes',
	zValidator(
		'json',
		z.object({
			notes: z.array(z.string()),
		}),
	),
	async (c) => {
		const { notes } = c.req.valid('json');
		for (const text of notes) {
			await c.env.RAG_WORKFLOW.create({ params: { text } });
		}
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
