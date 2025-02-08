import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

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

export default app;
