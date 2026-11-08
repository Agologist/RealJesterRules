DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  round_scores TEXT NOT NULL,
  standings TEXT NOT NULL,
  won INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
