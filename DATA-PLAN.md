# Data Plan

## Context provenance
- `a deck of 2-10 per player (9 cards each), all shuffled into a single deck which players are given random cards from in order` (prior user statement; sets Level 1 deck: N copies of ranks 2-10 shuffled together, dealt round-robin)
- `There's no score coming out of Level 1 beyond determining how many starting card each player has for level 2. The total of the cards each player collects in his/her deck at the end of Level 2 would be the score of that round. The total socre is the sum of all 3 rounds.` (prior user statement; scoring model)
- `Every player in Level 2 has a Jester card, but there's 1 extra Jester in the Level 2's deck.` (prior user statement; Level 2 deck: 4 each of J/Q/K/A per player + 1 Jester in deck, plus 1 Jester dealt into every player's starting hand per the doc)
- `tied cards go to the player's deck of collected cards. They're already played, so they can't be played again... when two tied cards are returned to their respective players, the remain cards of A and Q would be against each other which means A wins both A and Q` (prior user statement; tie resolution: tied top cards go to their owners' collected piles, remaining cards re-compared by rank, recursively)
- `Level 2 is over when there's no more cards to play with in required number of player to play Level 2` (prior user statement; Level 2 ends when fewer than 2 players hold cards)
- `Forget about multiplayer for the first version. Single player + bots would be great.` (prior user statement; v1 scope: human + 1-4 bots, table size 2-5)
- `I'm open to suggestions to make it addicting. Think of it as a casino game.` / `minimalism` (prior user statement; slow dramatic dealing, live ticking sums/scores, flip reveals, streaks, instant rematch)
- `You can design them the way you think would work best, including dealers and avatars for players to choose from.` (prior user statement; player picks a name + avatar medallion; bots get distinct personas; black-and-gold cards per the doc)
- Google Doc `JR Card Game / CardMaster` (user-supplied source, read in full at build time): Level 2 point 5 — after each trick each player draws new cards from the Level 2 deck equal to the number of cards they collected that trick; point 6 — once played, a card is burnt; point 2 — starting hand = Level 1 tens-digit draws PLUS a Jester per player; tie example 2 — when tied cards leave a single card on the table, its owner collects it; client feedback — slow dealing with scores ticking up live, `Round 1/3` style labels, Level 1/Level 2 popups ~2s, small black-and-gold cards, collected cards stacked visibly by each player, 7s play timer with random auto-play on timeout.

## Tested sources
### Google Doc (user-supplied rules source)
**Used by**: game engine rules (client-side), no runtime fetch
**Test command**: `curl -sL "https://docs.google.com/document/d/1m0AytNeVWXimZA_j9r1_JxAWUtHhho-uGQFNdshlVFs/export?format=txt"`
**Sample output**: Full GDD text returned: Level 1 deck 2-10 per player (as the user confirmed), tens digit sets Level 2 draws; Level 2 deck 4x J/Q/K/A per player + Jester; rank Jester > A > K > Q > J; winner collects all played cards; tied highest cards return to owners and remaining cards re-compared; draw-new-cards-equal-to-collected rule; burnt cards; 3 rounds; black-and-gold card sample; slow-deal + live-score client feedback.
**Processing**: Rules encoded once into the client game engine; conflicts resolved in favor of the user's later written clarifications (2-10, corrected by the user during the build; tied cards go to collected piles and count, not back to hand; extra Jester in deck plus one per player).

### GitHub repo Agologist/RealJesterRules
**Used by**: nothing (provenance only)
**Test command**: `curl -s -o /dev/null -w "%{http_code}" https://github.com/Agologist/RealJesterRules` -> 200, and prior verified finding (MEMORY.md, Nov 7 2026): repo is empty, no code/README/rules. All rules come from the Google Doc + user clarifications above.
**Processing**: none.

## Long-term data behavior
- **Refresh policy**: none; no external data. Game results are written by the player finishing a game (recordResult action) and read on the home screen (getStats).
- **Growth**: one game_results row per finished game; stats query caps recent list at 10 and aggregates best/wins/count.
- **Ordering**: recent results newest first.
- **Time semantics**: created_at stored as timestamp_ms, rendered viewer-local.

## Rejected approaches
- **Tried**: Fetching rules from the GitHub repo
  **Why rejected**: repo is empty (verified previously, page returns no files); the Google Doc + user clarifications are the authoritative rules source.
- **Tried**: Real-time card-pick grab and real multiplayer from the doc
  **Why rejected**: user explicitly cut multiplayer for v1 (answer 7) and left timers/pacing open (answer 6); the pick step is kept as a solo tap-to-pick ritual against bots instead.

Imagery not needed: playing cards, card backs, and avatar medallions are rendered in CSS/SVG in the black-and-gold design the user specified; the game has no photographic subjects.
