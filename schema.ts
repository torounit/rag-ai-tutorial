import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable(
	'notes',
	{
		id: int().primaryKey({ autoIncrement: true }),
		text: text().notNull(),
	},
);
