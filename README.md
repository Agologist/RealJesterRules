# CardMaster — JR Card Game

CardMaster (the "JR Card Game") is a minimal, casino-style web card game.
A game is 3 rounds. Each round has two levels. The highest total score
after Round 3 wins.

## The rules

**Level 1 — the deal.**
Each player contributes the cards 2–10 of a suit (9 cards per player).
All of those cards are shuffled into one single deck and dealt in order,
one card at a time, until the deck is empty. Add up the values of the
cards you received (a 10 is worth 10, a 3 is worth 3, and so on).
Level 1 has no winner and gives no score — its only purpose is to decide
how many cards you start Level 2 with: the tens digit of your total.
For example, a total of 47 means you start Level 2 with 4 cards.

**Level 2 — the showdown.**
The Level 2 deck has 4 Jacks, 4 Queens, 4 Kings and 4 Aces per player,
plus Jesters. Every player starts Level 2 with a Jester card in hand,
and there is 1 extra Jester in the deck.
Cards rank: **Jester > A > K > Q > J**.

Each player draws their starting cards from the Level 2 deck (the number
from Level 1) plus their Jester. Then everyone plays one card face-down
at the same time, and all cards are flipped together:

- The highest card wins and collects all the cards played that trick.
- The winner then draws new cards from the Level 2 deck, as many as they
  collected.
- Played cards are "burnt": once collected, they are never played again.
- If cards tie, each tied card goes to its owner's collected pile, and
  the remaining untied cards are compared by rank — the highest of those
  wins them. For example, K vs K ties (both Kings are collected by their
  owners), and the remaining A vs Q is won by the Ace, which collects
  both the Ace and the Queen.
- Level 2 ends when there are no longer enough players with cards left
  to play a trick.

**Scoring.** Each collected card is worth 1 point. Your score for a round
is the number of cards you collected in that round's Level 2. Your total
score is the sum of all 3 rounds.

## Version 1 scope

V1 is **single player + bots only**. There is no multiplayer, no login,
no profiles and no rank ladder yet — those are for later. The focus is
minimalism and addicting play: a clean black-and-gold table, a slow deal
with scores ticking up live, small cards, collected piles stacking up
visibly, a big Jester moment, a saved best score and win streak, and
one-tap Play Again.

## How this code works

This repo holds the source. The playable version lives in Muse as the
**CardMaster** web artifact.

It is a TypeScript space:

- `client/` — React client (`client/src/App.tsx`, `engine.ts`,
  `components.tsx`, `theme.css`). The game engine lives in the client.
- `server/src/` — server actions (`actions.ts`) and the data schema
  (`schema.ts`).
- `drizzle/` — Drizzle SQL migrations for the game-results table.
- `space.json` — the space manifest; the entry point is
  `client/dist/index.html`.
- `DATA-PLAN.md` — the data plan for the artifact.

Build it with:

```sh
bun install
bun run build
```

(`bun run build` builds the server, then the client.)
