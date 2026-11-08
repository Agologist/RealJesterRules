// CardMaster game engine — the rules exactly as Agah specified them.
//
// A game is 3 rounds. Each round is Level 1 + Level 2.
//
// Level 1: for every player, ranks 2-10 go into one shuffled deck, dealt in
// order. Each player sums their cards; the TENS digit of the sum is how many
// cards they draw to start Level 2. Level 1 itself scores nothing.
//
// Level 2: deck is 4x J, 4x Q, 4x K, 4x A per player, plus 1 extra Jester.
// Every player also gets a Jester in hand. Rank: Jester > A > K > Q > J.
// Everyone plays one card face-down simultaneously, then all flip:
//   - a unique highest card collects ALL played cards;
//   - tied highest cards go to their OWNERS' collected piles (burnt, counted),
//     and the remaining cards are compared again by the same rule; a single
//     card left on the table is collected by its owner.
// Played cards are burnt: collected cards are never replayed. After a trick,
// each player draws new cards from the deck equal to the number they just
// collected. Level 2 ends when fewer than 2 players hold a card.
// Round score = cards collected in Level 2. Total = sum of the 3 rounds.

export type FaceRank = "J" | "Q" | "K" | "A" | "JESTER";

export interface FaceCard {
  kind: "face";
  id: number;
  rank: FaceRank;
}

export interface NumberCard {
  kind: "num";
  id: number;
  value: number; // 2..10
}

export const RANK_VALUE: Record<FaceRank, number> = {
  J: 1,
  Q: 2,
  K: 3,
  A: 4,
  JESTER: 5,
};

export const RANK_LABEL: Record<FaceRank, string> = {
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
  JESTER: "Jester",
};

let nextId = 1;

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j] as T;
    a[j] = tmp as T;
  }
  return a;
}

/** Level 1 deck: ranks 2-10 (9 cards), one set per player, shuffled into a single deck. */
export function buildLevel1Deck(playerCount: number): NumberCard[] {
  const cards: NumberCard[] = [];
  for (let p = 0; p < playerCount; p++) {
    for (let v = 2; v <= 10; v++) {
      cards.push({ kind: "num", id: nextId++, value: v });
    }
  }
  return shuffle(cards);
}

/** Level 2 draw deck: 4x J/Q/K/A per player + 1 extra Jester. */
export function buildLevel2Deck(playerCount: number): FaceCard[] {
  const cards: FaceCard[] = [];
  const ranks: FaceRank[] = ["J", "Q", "K", "A"];
  for (let p = 0; p < playerCount; p++) {
    for (const rank of ranks) {
      for (let n = 0; n < 4; n++) {
        cards.push({ kind: "face", id: nextId++, rank });
      }
    }
  }
  cards.push({ kind: "face", id: nextId++, rank: "JESTER" });
  return shuffle(cards);
}

export function makeJester(): FaceCard {
  return { kind: "face", id: nextId++, rank: "JESTER" };
}

/** Tens digit of a Level 1 sum = number of starting draws for Level 2. */
export function tensDigit(sum: number): number {
  return Math.floor(sum / 10) % 10;
}

export interface Play {
  playerId: number;
  card: FaceCard;
}

export interface TrickOutcome {
  /** cards collected per player id from this trick */
  collected: Map<number, FaceCard[]>;
  /** player id who took the remaining pot outright, if any */
  potWinner: number | null;
  /** rank whose tie was burned to owners, in order, if any */
  tiedRanks: FaceRank[];
  /** highest rank that decided the trick */
  decidingRank: FaceRank;
}

/**
 * Resolve one Level 2 trick.
 * Unique top rank takes everything remaining. Tied top cards burn to their
 * owners' collected piles and the rest are re-compared; a lone remaining
 * card is collected by its owner.
 */
export function resolveTrick(plays: Play[]): TrickOutcome {
  const collected = new Map<number, FaceCard[]>();
  const tiedRanks: FaceRank[] = [];
  let potWinner: number | null = null;
  let remaining = [...plays];
  let decidingRank: FaceRank = plays[0]?.card.rank ?? "J";

  const give = (playerId: number, cards: FaceCard[]) => {
    const cur = collected.get(playerId) ?? [];
    collected.set(playerId, [...cur, ...cards]);
  };

  while (remaining.length > 0) {
    const topValue = Math.max(...remaining.map((p) => RANK_VALUE[p.card.rank]));
    const top = remaining.filter((p) => RANK_VALUE[p.card.rank] === topValue);
    const topRank = top[0]?.card.rank ?? "J";
    decidingRank = topRank;
    if (top.length === 1) {
      const winner = top[0];
      if (winner) {
        give(
          winner.playerId,
          remaining.map((p) => p.card),
        );
        if (remaining.length === plays.length) potWinner = winner.playerId;
        else if (potWinner === null) potWinner = winner.playerId;
      }
      remaining = [];
      break;
    }
    // Tie at the top: those cards burn to their owners' collected piles.
    tiedRanks.push(topRank);
    for (const p of top) give(p.playerId, [p.card]);
    remaining = remaining.filter((p) => RANK_VALUE[p.card.rank] !== topValue);
    if (remaining.length === 1) {
      const lone = remaining[0];
      if (lone) give(lone.playerId, [lone.card]);
      remaining = [];
      break;
    }
  }
  return { collected, potWinner, tiedRanks, decidingRank };
}

/** Simple casino-bot brain: keep the Jester and Aces for big moments, dump low cards early. */
export function botPickCard(hand: FaceCard[], aggression: number): FaceCard {
  const sorted = [...hand].sort(
    (a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank],
  );
  const lowest = sorted[0] as FaceCard;
  const jester = hand.find((c) => c.rank === "JESTER");
  const roll = Math.random();
  // Occasionally fire the Jester for drama, more likely when aggressive or desperate.
  if (jester && (roll < 0.06 + aggression * 0.1 || hand.length <= 2)) {
    return jester;
  }
  // Usually shed the lowest card; sometimes push a mid/high card.
  if (roll < 0.55) return lowest;
  if (roll < 0.85) {
    const mid = sorted[Math.floor(sorted.length / 2)] as FaceCard;
    return mid.rank === "JESTER" ? lowest : mid;
  }
  const high = [...sorted]
    .reverse()
    .find((c) => c.rank !== "JESTER") as FaceCard;
  return high ?? lowest;
}
