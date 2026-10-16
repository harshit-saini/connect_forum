import { sql } from "drizzle-orm";
import {
  boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/** One alias per user, unique case-insensitively across Seekers and Guides. */
export const userAliases = pgTable(
  "user_aliases",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_aliases_alias_lower_uq").on(sql`lower(${t.alias})`)],
);

/** Autosaved, not-yet-submitted wizard answers. Never contains phone numbers. */
export const profileDrafts = pgTable("profile_drafts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  stepReached: integer("step_reached").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const common = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The validated answers, exactly as entered (source of truth for display, editing and AI documents). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  /** Bumped on every matching-relevant change. */
  profileVersion: integer("profile_version").notNull().default(0),
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
  // Columns derived from `data` so hard filters and scores run in SQL.
  country: text("country"),
  timezone: text("timezone"),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  totalYears: integer("total_years"),
  seniority: text("seniority"),
  currentIndustry: text("current_industry"),
  currentFunction: text("current_function"),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  /** Normalised company names the user never wants to be matched with (never sent to AI). */
  excludedCompanies: text("excluded_companies").array().notNull().default(sql`'{}'::text[]`),
  availability: text("availability").array().notNull().default(sql`'{}'::text[]`),
  mode: text("mode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const seekerProfiles = pgTable("seeker_profiles", {
  ...common(),
  careerStage: text("career_stage"),
  primaryGoal: text("primary_goal"),
  targetIndustries: text("target_industries").array().notNull().default(sql`'{}'::text[]`),
  targetFunction: text("target_function"),
  helpNeeded: text("help_needed").array().notNull().default(sql`'{}'::text[]`),
  minGuideExperience: integer("min_guide_experience").notNull().default(0),
  mustShareLanguage: boolean("must_share_language").notNull().default(true),
  engagementStyle: text("engagement_style"),
});

export const guideProfiles = pgTable(
  "guide_profiles",
  {
    ...common(),
    primaryFunctions: text("primary_functions").array().notNull().default(sql`'{}'::text[]`),
    primaryIndustries: text("primary_industries").array().notNull().default(sql`'{}'::text[]`),
    helpTypes: text("help_types").array().notNull().default(sql`'{}'::text[]`),
    stagesBestAt: text("stages_best_at").array().notNull().default(sql`'{}'::text[]`),
    transitions: text("transitions").array().notNull().default(sql`'{}'::text[]`),
    hiringExperience: text("hiring_experience"),
    wontHelpTypes: text("wont_help_types").array().notNull().default(sql`'{}'::text[]`),
    maxNewSeekersPerMonth: integer("max_new_seekers_per_month"),
    sessionLength: integer("session_length"),
    matchingPaused: boolean("matching_paused").notNull().default(false),
  },
  (t) => [index("guide_profiles_matchable_idx").on(t.matchingPaused, t.totalYears)],
);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Guide phone numbers, AES-256-GCM encrypted. Only the reveal endpoint ever decrypts. */
export const phoneVault = pgTable("phone_vault", {
  guideId: uuid("guide_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  encryptedNumber: bytea("encrypted_number").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  /** Last 4 digits, so the form can confirm a number is on file without returning it. */
  last4: text("last4").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
