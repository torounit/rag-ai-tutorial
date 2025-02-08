import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { notes } from './db/schema';
import { drizzle } from 'drizzle-orm/d1';

export type Params = {
	text: string;
};

export class RAGWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const { text } = event.payload;
		const env = this.env;

		const record = await step.do(`create database record`, async () => {
			const db = drizzle(env.DB);
			const result = await db.insert(notes).values({ text }).returning();
			if (!result) {
				throw new Error(`Failed to create record`);
			}
			return result[0];
		});

		const embedding = await step.do(`generate embedding`, async () => {
			const embeddings = await env.AI.run(`@cf/baai/bge-base-en-v1.5`, {
				text,
			});
			const values = embeddings.data[0];
			if (!values) {
				throw new Error(`Failed to generate embedding`);
			}
			return values;
		});

		await step.do(`insert vector`, async () => {
			return env.VECTORIZE.upsert([
				{
					id: record.id.toString(),
					values: embedding,
				}
			]);
		})
	}
}
