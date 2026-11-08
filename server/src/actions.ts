// Actions for CardMaster. The game itself runs client-side (bots, dealing,
// trick resolution); the server only persists finished-game results so the
// player has a durable best score, win count, and recent-games history.

import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { desc } from "drizzle-orm";
import * as schema from "./schema";

const standingSchema = z.object({
  name: z.string(),
  score: z.number().int().nonnegative(),
  isHuman: z.boolean(),
});

const recentGameSchema = z.object({
  id: z.number(),
  totalScore: z.number(),
  won: z.boolean(),
  playerCount: z.number(),
  roundScores: z.array(z.number()),
  standings: z.array(standingSchema),
  createdAt: z.string(),
});

const getStatsResponse = z.object({
  gamesPlayed: z.number(),
  wins: z.number(),
  bestScore: z.number().nullable(),
  recent: z.array(recentGameSchema),
});

export const Actions = {
  recordResult: defineAction({
    description:
      "Records one finished CardMaster game (final standings and the player's total) and returns its id.",
    request: z.object({
      playerName: z.string().min(1).max(24),
      avatar: z.string().min(1).max(8),
      playerCount: z.number().int().min(2).max(5),
      totalScore: z.number().int().nonnegative(),
      roundScores: z.array(z.number().int().nonnegative()).length(3),
      standings: z.array(standingSchema).min(2).max(5),
      won: z.boolean(),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.gameResults)
        .values({
          playerName: args.playerName,
          avatar: args.avatar,
          playerCount: args.playerCount,
          totalScore: args.totalScore,
          roundScores: JSON.stringify(args.roundScores),
          standings: JSON.stringify(args.standings),
          won: args.won ? 1 : 0,
        })
        .returning({ id: schema.gameResults.id });
      const inserted = result[0];
      if (!inserted) {
        throw new Error("recordResult: insert returned no rows");
      }
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  getStats: defineAction({
    description:
      "Returns the player's CardMaster history: games played, wins, best total score, and the 8 most recent games.",
    request: z.object({}),
    response: getStatsResponse,
    async handler(ctx): Promise<z.infer<typeof getStatsResponse>> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.gameResults)
        .orderBy(desc(schema.gameResults.id))
        .limit(200);
      const gamesPlayed = rows.length;
      const wins = rows.filter((r) => r.won === 1).length;
      const bestScore =
        gamesPlayed === 0
          ? null
          : Math.max(...rows.map((r) => r.totalScore));
      const recent = rows.slice(0, 8).map((r) => ({
        id: r.id,
        totalScore: r.totalScore,
        won: r.won === 1,
        playerCount: r.playerCount,
        roundScores: JSON.parse(r.roundScores) as number[],
        standings: JSON.parse(r.standings) as z.infer<typeof standingSchema>[],
        createdAt: r.createdAt.toISOString(),
      }));
      return { gamesPlayed, wins, bestScore, recent };
    },
  }),
} satisfies ActionsModule;
