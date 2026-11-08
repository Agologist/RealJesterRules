import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameResults = sqliteTable("game_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerName: text("player_name").notNull(),
  avatar: text("avatar").notNull(),
  playerCount: integer("player_count").notNull(),
  totalScore: integer("total_score").notNull(),
  /** JSON array of the human player's per-round scores, e.g. "[12,9,15]". */
  roundScores: text("round_scores").notNull(),
  /** JSON array of final standings: [{ name, score, isHuman }]. */
  standings: text("standings").notNull(),
  won: integer("won").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
