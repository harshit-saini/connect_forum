import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Named integer counters, e.g. `guide_pool_version` (bumped when any matchable Guide changes). */
export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
