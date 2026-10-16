import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const roleEnum = pgEnum("role", ["seeker", "guide"]);

/** One row per role a user holds. Today the app enforces a single role; the schema allows both later. */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

const profileBase = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Bumped on every matching-relevant change. */
  profileVersion: integer("profile_version").notNull().default(0),
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Milestone 2 skeletons; the full career-profile columns arrive in milestone 3.
export const seekerProfiles = pgTable("seeker_profiles", profileBase());
export const guideProfiles = pgTable("guide_profiles", profileBase());

/** Development-only mailbox, written when MOCK_AI=true instead of calling Resend. */
export const devOutbox = pgTable(
  "dev_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dev_outbox_to_idx").on(t.to, t.createdAt)],
);

/** Named integer counters, e.g. `guide_pool_version` (bumped when any matchable Guide changes). */
export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
