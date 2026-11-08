// CardMaster — single player vs bots. 3 rounds of Level 1 + Level 2.
// Rules live in ./engine.ts; this file is the table, the flow, and the feel.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "./api";
import {
RANK_LABEL,
botPickCard,
buildLevel1Deck,
buildLevel2Deck,
makeJester,
resolveTrick,
tensDigit,
type FaceCard,
type NumberCard,
} from "./engine";
import {
AVATARS,
AvatarMedallion,
CardBack,
CollectedPile,
FaceCardView,
NumberCardView,
avatarById,
type AvatarDef,
} from "./components";

/* ---------------- model ---------------- */

interface PlayerState {
  id: number;
  name: string;
  avatar: AvatarDef;
  isBot: boolean;
  aggression: number;
  l1Cards: NumberCard[];
  l1Sum: number;
  startDraws: number;
  hand: FaceCard[];
  collected: number;
  roundScores: number[];
  totalScore: number;
  streak: number;
  bestStreak: number;
}

interface TablePlay {
  playerId: number;
  card: FaceCard;
  faceUp: boolean;
  result?: "pot" | "own" | "lost";
}

type Phase =
  | "setup"
  | "banner"
  | "l1deal"
  | "l1result"
  | "pick"
  | "play"
  | "roundEnd"
  | "gameEnd";

type TrickStage = "choose" | "reveal" | "settle";

const BOT_POOL: { name: string; avatarId: string; aggression: number }[] = [
  { name: "Vega", avatarId: "spade", aggression: 0.35 },
  { name: "Mona", avatarId: "leaf", aggression: 0.15 },
  { name: "Rex", avatarId: "flame", aggression: 0.85 },
  { name: "Ivy", avatarId: "wave", aggression: 0.55 },
  { name: "Silas", avatarId: "star", aggression: 0.45 },
];

const PLAY_SECONDS = 10;
const PICK_SECONDS = 20;

function sortHand(hand: FaceCard[]): FaceCard[] {
  const val = (c: FaceCard) =>
    c.rank === "JESTER" ? 5 : { J: 1, Q: 2, K: 3, A: 4 }[c.rank];
  return [...hand].sort((a, b) => val(a) - val(b));
}

function loadPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/* ---------------- app ---------------- */

export function App() {
  const queryClient = useQueryClient();
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats({}),
  });

  // setup prefs
  const [playerName, setPlayerName] = useState(() =>
    loadPref("cm-name", "Agah"),
  );
  const [avatarId, setAvatarId] = useState(() => loadPref("cm-avatar", "crown"));
  const [tableSize, setTableSize] = useState(4);
  const [showRules, setShowRules] = useState(false);

  // game state
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [round, setRound] = useState(1);
  const [banner, setBanner] = useState({ title: "", sub: "" });
  const [deckCount, setDeckCount] = useState(0);
  const [picksLeft, setPicksLeft] = useState(0);
  const [pickClock, setPickClock] = useState(PICK_SECONDS);
  const [table, setTable] = useState<TablePlay[]>([]);
  const [trickStage, setTrickStage] = useState<TrickStage>("choose");
  const [playClock, setPlayClock] = useState(PLAY_SECONDS);
  const [message, setMessage] = useState("");
  const [dealtCount, setDealtCount] = useState(0);
  const [l1Total, setL1Total] = useState(0);
  const [muted, setMuted] = useState(false);

  const playersRef = useRef<PlayerState[]>([]);
  const deckRef = useRef<FaceCard[]>([]);
  const l1Ref = useRef<{ deck: NumberCard[]; idx: number }>({ deck: [], idx: 0 });
  const timersRef = useRef<number[]>([]);
  const gameIdRef = useRef(0);
  const afterBannerRef = useRef<() => void>(() => {});
  const recordedRef = useRef(false);
  const mutedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);

  const commitPlayers = (next: PlayerState[]) => {
    playersRef.current = next;
    setPlayers(next);
  };

  const later = (fn: () => void, ms: number) => {
    const gid = gameIdRef.current;
    const id = window.setTimeout(() => {
      if (gameIdRef.current === gid) fn();
    }, ms);
    timersRef.current.push(id);
  };
  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  /* ---- tiny casino synth ---- */
  const tone = (
    freq: number,
    dur: number,
    delay = 0,
    type: OscillatorType = "sine",
    vol = 0.05,
  ) => {
    if (mutedRef.current) return;
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + delay + dur,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + dur);
    } catch {
      /* no audio available */
    }
  };
  const sfx = {
    deal: () => tone(540, 0.05, 0, "triangle", 0.035),
    pick: () => tone(680, 0.06, 0, "triangle", 0.05),
    flip: () => tone(820, 0.07, 0, "sine", 0.05),
    place: () => tone(340, 0.06, 0, "triangle", 0.04),
    win: () => {
      tone(523, 0.1);
      tone(659, 0.1, 0.09);
      tone(784, 0.16, 0.18);
    },
    jester: () => {
      tone(880, 0.09);
      tone(1174, 0.09, 0.08);
      tone(1568, 0.18, 0.16);
    },
    lose: () => tone(180, 0.16, 0, "sawtooth", 0.025),
  };

  const recordMutation = useMutation({
    mutationFn: api.recordResult,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stats"] }),
  });

  const human = players.find((p) => !p.isBot);
  const humanActive =
    !!human && human.hand.length > 0 && phase === "play";
  const humanPlayed = table.some((t) => t.playerId === human?.id);

  /* ================= game flow ================= */

  const showBanner = (title: string, sub: string, next: () => void) => {
    setBanner({ title, sub });
    afterBannerRef.current = next;
    setPhase("banner");
    later(() => afterBannerRef.current(), 1900);
  };

  const buildPlayers = (): PlayerState[] => {
    const name = playerName.trim() || "You";
    const bots = BOT_POOL.filter((b) => b.avatarId !== avatarId)
      .slice(0, tableSize - 1)
      .map((b, i) => ({
        id: i + 1,
        name: b.name,
        avatar: avatarById(b.avatarId),
        isBot: true,
        aggression: b.aggression,
        l1Cards: [],
        l1Sum: 0,
        startDraws: 0,
        hand: [],
        collected: 0,
        roundScores: [],
        totalScore: 0,
        streak: 0,
        bestStreak: 0,
      }));
    return [
      {
        id: 0,
        name,
        avatar: avatarById(avatarId),
        isBot: false,
        aggression: 0,
        l1Cards: [],
        l1Sum: 0,
        startDraws: 0,
        hand: [],
        collected: 0,
        roundScores: [],
        totalScore: 0,
        streak: 0,
        bestStreak: 0,
      },
      ...bots,
    ];
  };

  const startGame = () => {
    gameIdRef.current++;
    clearTimers();
    recordedRef.current = false;
    savePref("cm-name", playerName.trim() || "You");
    savePref("cm-avatar", avatarId);
    const fresh = buildPlayers();
    commitPlayers(fresh);
    setRound(1);
    setTable([]);
    setMessage("");
    startRound(1, fresh);
  };

  const startRound = (r: number, base: PlayerState[]) => {
    const reset = base.map((p) => ({
      ...p,
      l1Cards: [],
      l1Sum: 0,
      startDraws: 0,
      hand: [],
      collected: 0,
    }));
    commitPlayers(reset);
    showBanner(`Round ${r}/3`, "Level 1 — the deal sets your hand", () =>
      startLevel1(reset.length),
    );
  };

  const startLevel1 = (count: number) => {
    const deck = buildLevel1Deck(count);
    l1Ref.current = { deck, idx: 0 };
    setL1Total(deck.length);
    setDealtCount(0);
    setPhase("l1deal");
    const dealNext = () => {
      const { deck: d } = l1Ref.current;
      const idx = l1Ref.current.idx;
      if (idx >= d.length) {
        // settle sums -> tens digit -> starting draws
        const settled = playersRef.current.map((p) => ({
          ...p,
          startDraws: Math.max(1, tensDigit(p.l1Sum)),
        }));
        commitPlayers(settled);
        setPhase("l1result");
        later(() => {
          showBanner("Level 2", "Jester beats all — collect the table", () =>
            startPick(),
          );
        }, 3400);
        return;
      }
      const card = d[idx] as NumberCard;
      const target = idx % count;
      l1Ref.current.idx = idx + 1;
      setDealtCount(idx + 1);
      sfx.deal();
      commitPlayers(
        playersRef.current.map((p, i) =>
          i === target
            ? { ...p, l1Cards: [...p.l1Cards, card], l1Sum: p.l1Sum + card.value }
            : p,
        ),
      );
      later(dealNext, 230);
    };
    later(dealNext, 350);
  };

  const skipDeal = () => {
    clearTimers();
    const { deck } = l1Ref.current;
    const count = playersRef.current.length;
    const next = playersRef.current.map((p) => ({ ...p, l1Cards: [] as NumberCard[], l1Sum: 0 }));
    deck.forEach((card, idx) => {
      const t = next[idx % count] as PlayerState;
      t.l1Cards = [...t.l1Cards, card];
      t.l1Sum += card.value;
    });
    const settled = next.map((p) => ({
      ...p,
      startDraws: Math.max(1, tensDigit(p.l1Sum)),
    }));
    commitPlayers(settled);
    setDealtCount(deck.length);
    setPhase("l1result");
    later(() => {
      showBanner("Level 2", "Jester beats all — collect the table", () =>
        startPick(),
      );
    }, 3400);
  };

  const startPick = () => {
    const count = playersRef.current.length;
    const deck = buildLevel2Deck(count);
    // Bots draw their starting cards sight unseen, like at a real table.
    const next = playersRef.current.map((p) => {
      if (!p.isBot) return p;
      const drawn = deck.splice(0, p.startDraws);
      return { ...p, hand: drawn };
    });
    deckRef.current = deck;
    setDeckCount(deck.length);
    commitPlayers(next);
    const h = next.find((p) => !p.isBot);
    setPicksLeft(h?.startDraws ?? 0);
    setPickClock(PICK_SECONDS);
    setPhase("pick");
  };

  const finishPick = () => {
    // Every player gets a Jester in hand for Level 2.
    const next = playersRef.current.map((p) => ({
      ...p,
      hand: sortHand([...p.hand, makeJester()]),
    }));
    commitPlayers(next);
    sfx.jester();
    setMessage("");
    later(() => startTrick(), 700);
    setPhase("play");
    setTrickStage("choose");
    setTable([]);
  };

  const humanPick = () => {
    if (phase !== "pick" || picksLeft <= 0) return;
    const card = deckRef.current.pop();
    if (!card) return;
    setDeckCount(deckRef.current.length);
    sfx.pick();
    commitPlayers(
      playersRef.current.map((p) =>
        p.isBot ? p : { ...p, hand: sortHand([...p.hand, card]) },
      ),
    );
    const left = picksLeft - 1;
    setPicksLeft(left);
    if (left <= 0) later(finishPick, 600);
  };

  // pick countdown: auto-pick the rest when it runs out
  useEffect(() => {
    if (phase !== "pick") return;
    const iv = window.setInterval(() => {
      setPickClock((c) => {
        if (c <= 0.1) {
          window.clearInterval(iv);
          // auto-pick whatever is left
          const h = playersRef.current.find((p) => !p.isBot);
          if (h) {
            const need = h.startDraws - h.hand.length;
            const drawn = deckRef.current.splice(
              deckRef.current.length - need,
              need,
            );
            setDeckCount(deckRef.current.length);
            commitPlayers(
              playersRef.current.map((p) =>
                p.isBot ? p : { ...p, hand: sortHand([...p.hand, ...drawn]) },
              ),
            );
          }
          setPicksLeft(0);
          later(finishPick, 500);
          return 0;
        }
        return Math.max(0, c - 0.1);
      });
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ---- tricks ---- */

  const activePlayers = (ps: PlayerState[]) => ps.filter((p) => p.hand.length > 0);

  const startTrick = () => {
    const ps = playersRef.current;
    if (activePlayers(ps).length < 2) {
      endLevel2();
      return;
    }
    setTable([]);
    setTrickStage("choose");
    setPlayClock(PLAY_SECONDS);
    setMessage("");
    const h = ps.find((p) => !p.isBot);
    if (!h || h.hand.length === 0) {
      // human is out: bots play it out at a watchable pace
      later(() => botsPlay([]), 700);
    }
  };

  const botsPlay = (current: TablePlay[]) => {
    const ps = playersRef.current;
    const active = activePlayers(ps).filter(
      (p) => p.isBot && !current.some((t) => t.playerId === p.id),
    );
    let placed = current;
    active.forEach((bot, i) => {
      later(
        () => {
          const fresh = playersRef.current.find((p) => p.id === bot.id);
          if (!fresh || fresh.hand.length === 0) return;
          const card = botPickCard(fresh.hand, fresh.aggression);
          commitPlayers(
            playersRef.current.map((p) =>
              p.id === bot.id
                ? { ...p, hand: p.hand.filter((c) => c.id !== card.id) }
                : p,
            ),
          );
          sfx.place();
          placed = [...placed, { playerId: bot.id, card, faceUp: false }];
          setTable(placed);
          if (i === active.length - 1) later(revealTrick, 550);
        },
        260 * (i + 1) + Math.random() * 200,
      );
    });
    if (active.length === 0) later(revealTrick, 400);
  };

  const humanPlay = (card: FaceCard) => {
    if (phase !== "play" || trickStage !== "choose" || humanPlayed) return;
    const h = playersRef.current.find((p) => !p.isBot);
    if (!h || !h.hand.some((c) => c.id === card.id)) return;
    commitPlayers(
      playersRef.current.map((p) =>
        p.isBot ? p : { ...p, hand: p.hand.filter((c) => c.id !== card.id) },
      ),
    );
    sfx.place();
    const placed: TablePlay[] = [
      ...table,
      { playerId: 0, card, faceUp: false },
    ];
    setTable(placed);
    botsPlay(placed);
  };

  // play clock: auto-play a random card when the human stalls
  useEffect(() => {
    if (phase !== "play" || trickStage !== "choose") return;
    if (!humanActive || humanPlayed) return;
    const iv = window.setInterval(() => {
      setPlayClock((c) => {
        if (c <= 0.1) {
          window.clearInterval(iv);
          const h = playersRef.current.find((p) => !p.isBot);
          if (h && h.hand.length > 0) {
            const card = h.hand[Math.floor(Math.random() * h.hand.length)];
            if (card) humanPlay(card);
          }
          return PLAY_SECONDS;
        }
        return Math.max(0, c - 0.1);
      });
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, trickStage, humanActive, humanPlayed, table]);

  const revealTrick = () => {
    setTrickStage("reveal");
    setTable((t) => t.map((p) => ({ ...p, faceUp: true })));
    sfx.flip();
    later(settleTrick, 1150);
  };

  const settleTrick = () => {
    setTrickStage("settle");
    setTable((current) => {
      const outcome = resolveTrick(
        current.map((t) => ({ playerId: t.playerId, card: t.card })),
      );
      const ps = playersRef.current;
      // apply collections + draws (draw as many as you collected)
      const next = ps.map((p) => {
        const gained = outcome.collected.get(p.id)?.length ?? 0;
        if (gained === 0) return p;
        const drawn = deckRef.current.splice(
          deckRef.current.length - Math.min(gained, deckRef.current.length),
          Math.min(gained, deckRef.current.length),
        );
        return {
          ...p,
          collected: p.collected + gained,
          hand: p.isBot ? [...p.hand, ...drawn] : sortHand([...p.hand, ...drawn]),
        };
      });
      // streaks: collecting the pot builds it, collecting nothing breaks it
      const withStreaks = next.map((p) => {
        const gained = outcome.collected.get(p.id)?.length ?? 0;
        const played = current.some((t) => t.playerId === p.id);
        if (!played) return p;
        if (outcome.potWinner === p.id) {
          const s = p.streak + 1;
          return { ...p, streak: s, bestStreak: Math.max(p.bestStreak, s) };
        }
        if (gained === 0) return { ...p, streak: 0 };
        return p;
      });
      commitPlayers(withStreaks);
      setDeckCount(deckRef.current.length);

      // message + sounds
      const nameOf = (id: number) =>
        ps.find((p) => p.id === id)?.name ?? "?";
      const humanGained = outcome.collected.get(0)?.length ?? 0;
      let msg = "";
      if (outcome.tiedRanks.length > 0) {
        msg = `${outcome.tiedRanks.map((r) => RANK_LABEL[r]).join(" & ")} tied — those cards burn to their owners. `;
      }
      if (outcome.potWinner !== null) {
        const w = outcome.potWinner;
        const won = outcome.collected.get(w)?.length ?? 0;
        msg +=
          w === 0
            ? `You take ${won} cards with ${RANK_LABEL[outcome.decidingRank]}.`
            : `${nameOf(w)} takes ${won} cards with ${RANK_LABEL[outcome.decidingRank]}.`;
        if (outcome.decidingRank === "JESTER") sfx.jester();
        else if (w === 0) sfx.win();
      } else if (humanGained > 0) {
        msg += "Everyone keeps their own card.";
      } else {
        msg += "No winner — every card burns to its owner.";
      }
      if (outcome.potWinner !== 0 && humanGained === 0) sfx.lose();
      setMessage(msg);

      const marked = current.map((t) => {
        const got = outcome.collected.get(t.playerId) ?? [];
        const isOwnOnly =
          got.length === 1 && got[0]?.id === t.card.id;
        return {
          ...t,
          result:
            outcome.potWinner === t.playerId
              ? ("pot" as const)
              : isOwnOnly
                ? ("own" as const)
                : ("lost" as const),
        };
      });
      later(() => {
        if (activePlayers(playersRef.current).length < 2) endLevel2();
        else startTrick();
      }, 1900);
      return marked;
    });
  };

  const endLevel2 = () => {
    const next = playersRef.current.map((p) => ({
      ...p,
      roundScores: [...p.roundScores, p.collected],
      totalScore: p.totalScore + p.collected,
    }));
    commitPlayers(next);
    setTable([]);
    setPhase("roundEnd");
  };

  const nextRoundOrEnd = () => {
    if (round < 3) {
      const r = round + 1;
      setRound(r);
      startRound(r, playersRef.current);
    } else {
      setPhase("gameEnd");
    }
  };

  // record the result once, when the final screen first appears
  useEffect(() => {
    if (phase !== "gameEnd" || recordedRef.current) return;
    const ps = playersRef.current;
    const h = ps.find((p) => !p.isBot);
    if (!h) return;
    recordedRef.current = true;
    const max = Math.max(...ps.map((p) => p.totalScore));
    recordMutation.mutate({
      playerName: h.name,
      avatar: h.avatar.id,
      playerCount: ps.length,
      totalScore: h.totalScore,
      roundScores: h.roundScores,
      standings: [...ps]
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((p) => ({ name: p.name, score: p.totalScore, isHuman: !p.isBot })),
      won: h.totalScore >= max,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const quitToSetup = () => {
    gameIdRef.current++;
    clearTimers();
    setPhase("setup");
    setTable([]);
    setMessage("");
  };

  const toggleMute = () => {
    setMuted((m) => {
      mutedRef.current = !m;
      return !m;
    });
  };

  /* ================= render ================= */

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      {phase === "setup" ? (
        <SetupScreen
          name={playerName}
          setName={setPlayerName}
          avatarId={avatarId}
          setAvatarId={setAvatarId}
          tableSize={tableSize}
          setTableSize={setTableSize}
          onStart={startGame}
          onRules={() => setShowRules(true)}
          stats={stats.data}
          statsLoading={stats.isPending}
        />
      ) : (
        <GameScreen
          phase={phase}
          banner={banner}
          players={players}
          round={round}
          deckCount={deckCount}
          picksLeft={picksLeft}
          pickClock={pickClock}
          table={table}
          trickStage={trickStage}
          playClock={playClock}
          message={message}
          dealtCount={dealtCount}
          l1Total={l1Total}
          muted={muted}
          onToggleMute={toggleMute}
          onQuit={quitToSetup}
          onRules={() => setShowRules(true)}
          onSkipDeal={skipDeal}
          onPick={humanPick}
          onPlay={humanPlay}
          onNextRound={nextRoundOrEnd}
          onPlayAgain={startGame}
          humanActive={humanActive}
          humanPlayed={humanPlayed}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

/* ================= setup / lobby ================= */

type StatsData = Awaited<ReturnType<typeof api.getStats>>;

function SetupScreen(props: {
  name: string;
  setName: (v: string) => void;
  avatarId: string;
  setAvatarId: (v: string) => void;
  tableSize: number;
  setTableSize: (v: number) => void;
  onStart: () => void;
  onRules: () => void;
  stats: StatsData | undefined;
  statsLoading: boolean;
}) {
  const s = props.stats;
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-10 pt-10">
      <div className="text-center">
        <div aria-hidden className="text-3xl" style={{ color: "var(--accent)" }}>
          ◆
        </div>
        <h1
          className="font-display mt-1 text-4xl font-bold tracking-[0.18em]"
          style={{ color: "var(--accent-bright)" }}
        >
          CARDMASTER
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
          Three rounds. Two levels. One Jester beats everything.
        </p>
      </div>

      <section
        className="mt-8 rounded-2xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <label
          htmlFor="player-name"
          className="text-xs font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--dim)" }}
        >
          Your name
        </label>
        <input
          id="player-name"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          maxLength={24}
          className="mt-2 w-full rounded-lg border px-3 py-2.5 text-base outline-none"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
        />

        <p
          className="mt-5 text-xs font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--dim)" }}
        >
          Choose your avatar
        </p>
        <div className="mt-2 flex flex-wrap gap-3" role="radiogroup" aria-label="Choose your avatar">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={props.avatarId === a.id}
              aria-label={a.label}
              onClick={() => props.setAvatarId(a.id)}
              className="rounded-full transition-transform active:scale-95"
              style={
                props.avatarId === a.id
                  ? { transform: "scale(1.12)" }
                  : { opacity: 0.55 }
              }
            >
              <AvatarMedallion avatar={a} size={52} active={props.avatarId === a.id} />
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
          {avatarById(props.avatarId).label}
        </p>

        <p
          className="mt-5 text-xs font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--dim)" }}
        >
          Table size
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Table size">
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={props.tableSize === n}
              onClick={() => props.setTableSize(n)}
              className="rounded-lg border py-2.5 font-display text-base font-semibold"
              style={{
                borderColor:
                  props.tableSize === n ? "var(--accent)" : "var(--border)",
                background:
                  props.tableSize === n ? "var(--surface-2)" : "transparent",
                color:
                  props.tableSize === n
                    ? "var(--accent-bright)"
                    : "var(--dim)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
          You + {props.tableSize - 1} {props.tableSize - 1 === 1 ? "bot" : "bots"} at the table
        </p>

        <button
          onClick={props.onStart}
          className="font-display mt-6 w-full rounded-xl py-3.5 text-lg font-bold tracking-[0.12em] text-black transition-transform active:scale-[0.98]"
          style={{ background: "var(--gold-grad)" }}
        >
          DEAL ME IN
        </button>
        <button
          onClick={props.onRules}
          className="mt-3 w-full py-2 text-sm font-medium"
          style={{ color: "var(--accent)" }}
        >
          How to play
        </button>
      </section>

      <section className="mt-6">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Best total", value: s?.bestScore ?? "—" },
            { label: "Games", value: s?.gamesPlayed ?? "—" },
            { label: "Wins", value: s?.wins ?? "—" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border py-3"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="font-display text-2xl font-bold"
                style={{ color: "var(--accent-bright)" }}
              >
                {props.statsLoading ? "…" : stat.value}
              </div>
              <div
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: "var(--dim)" }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {s && s.recent.length > 0 && (
          <div className="mt-5">
            <h2
              className="text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--dim)" }}
            >
              Recent games
            </h2>
            <ul className="mt-2 space-y-2">
              {s.recent.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-2.5"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                  }}
                >
                  <span className="text-sm" style={{ color: "var(--text)" }}>
                    {g.won ? "Won" : "Lost"} · {g.playerCount} players
                    <span className="ml-2" style={{ color: "var(--dim)" }}>
                      rounds {g.roundScores.join(" + ")}
                    </span>
                  </span>
                  <span
                    className="font-display text-lg font-bold"
                    style={{ color: g.won ? "var(--accent-bright)" : "var(--dim)" }}
                  >
                    {g.totalScore}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

/* ================= game table ================= */

function GameScreen(props: {
  phase: Phase;
  banner: { title: string; sub: string };
  players: PlayerState[];
  round: number;
  deckCount: number;
  picksLeft: number;
  pickClock: number;
  table: TablePlay[];
  trickStage: TrickStage;
  playClock: number;
  message: string;
  dealtCount: number;
  l1Total: number;
  muted: boolean;
  onToggleMute: () => void;
  onQuit: () => void;
  onRules: () => void;
  onSkipDeal: () => void;
  onPick: () => void;
  onPlay: (card: FaceCard) => void;
  onNextRound: () => void;
  onPlayAgain: () => void;
  humanActive: boolean;
  humanPlayed: boolean;
}) {
  const {
    phase,
    players,
    round,
    table,
    trickStage,
  } = props;
  const human = players.find((p) => !p.isBot);
  const bots = players.filter((p) => p.isBot);
  const inLevel2 = phase === "pick" || phase === "play";
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const humanWonGame =
    human && sorted[0] && sorted[0].id === human.id && phase === "gameEnd";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-3 pb-5 pt-3 sm:px-5">
      {/* top strip */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="font-display text-sm font-bold tracking-[0.14em]"
          style={{ color: "var(--accent-bright)" }}
        >
          ROUND {round}/3
          <span className="ml-2" style={{ color: "var(--dim)" }}>
            {phase === "l1deal" || phase === "l1result"
              ? "LEVEL 1"
              : inLevel2
                ? "LEVEL 2"
                : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label={props.muted ? "Unmute sound" : "Mute sound"}
            onClick={props.onToggleMute}
          >
            {props.muted ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>
            )}
          </IconButton>
          <IconButton label="How to play" onClick={props.onRules}>
            <span className="font-display text-base font-bold">?</span>
          </IconButton>
          <IconButton label="Leave game" onClick={props.onQuit}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </IconButton>
        </div>
      </div>

      {/* scoreboard strip */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sorted.map((p) => (
          <span
            key={p.id}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{
              borderColor: p.isBot ? "var(--border)" : "var(--accent)",
              color: "var(--text)",
              background: "var(--surface)",
            }}
          >
            {p.name}{" "}
            <strong style={{ color: "var(--accent-bright)" }}>
              {p.totalScore + (phase === "play" ? p.collected : 0)}
            </strong>
            {p.streak >= 2 && (
              <span style={{ color: "var(--accent-bright)" }}> · streak {p.streak}</span>
            )}
          </span>
        ))}
      </div>

      {/* opponents */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {bots.map((bot) => (
          <OpponentSeat
            key={bot.id}
            bot={bot}
            phase={phase}
            playedCard={table.find((t) => t.playerId === bot.id)}
          />
        ))}
        {/* deck */}
        <div
          className="flex flex-col items-center justify-center rounded-xl border py-2"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="relative">
            <CardBack small />
            {inLevel2 && (
              <span
                className="absolute -right-2 -top-2 rounded-full px-1.5 text-[11px] font-bold text-black"
                style={{ background: "var(--accent-bright)" }}
              >
                {props.deckCount}
              </span>
            )}
          </div>
          <span className="mt-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--dim)" }}>
            {phase === "l1deal"
              ? `Dealing ${props.dealtCount}/${props.l1Total}`
              : "Deck"}
          </span>
        </div>
      </div>

      {/* center table */}
      <div
        className="relative mt-3 flex-1 rounded-[28px] border px-3 py-4"
        style={{
          background:
            "radial-gradient(ellipse at 50% 38%, #1a3d29 0%, var(--felt) 55%, var(--felt-edge) 100%)",
          borderColor: "#2c2415",
          minHeight: 210,
        }}
      >
        {phase === "banner" && (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
            <div
              className="font-display banner-pop text-3xl font-bold tracking-[0.14em] sm:text-4xl"
              style={{ color: "var(--accent-bright)" }}
            >
              {props.banner.title}
            </div>
            <p className="mt-2 text-sm" style={{ color: "#cfe3d4" }}>
              {props.banner.sub}
            </p>
          </div>
        )}

        {(phase === "l1deal" || phase === "l1result") && human && (
          <Level1Area players={players} phase={phase} onSkip={props.onSkipDeal} />
        )}

        {phase === "pick" && human && (
          <PickArea
            picksLeft={props.picksLeft}
            pickClock={props.pickClock}
            deckCount={props.deckCount}
            onPick={props.onPick}
          />
        )}

        {phase === "play" && (
          <div className="flex min-h-[180px] flex-col items-center justify-center">
            {props.message ? (
              <p
                className="fade-up mb-3 max-w-md text-center text-sm font-medium"
                style={{ color: "#f5efe0" }}
                role="status"
              >
                {props.message}
              </p>
            ) : (
              <p className="mb-3 text-sm" style={{ color: "#9db8a6" }}>
                {trickStage === "choose"
                  ? props.humanActive && !props.humanPlayed
                    ? "Pick a card from your hand — everyone plays face-down"
                    : props.humanActive
                      ? "Your card is down. Waiting for the table…"
                      : "You're out of cards — the bots play this one out"
                  : trickStage === "reveal"
                    ? "Flip!"
                    : ""}
              </p>
            )}
            <div className="flex flex-wrap items-end justify-center gap-3">
              {table.map((t) => {
                const owner = players.find((p) => p.id === t.playerId);
                return (
                  <div key={t.playerId} className="flex flex-col items-center gap-1">
                    {t.faceUp ? (
                      <div className="flip-in">
                        <FaceCardView
                          card={t.card}
                          glow={t.result === "pot"}
                          dim={t.result === "lost"}
                        />
                      </div>
                    ) : (
                      <div className="place-down">
                        <CardBack />
                      </div>
                    )}
                    <span
                      className="text-[11px] font-medium"
                      style={{
                        color:
                          t.result === "pot"
                            ? "var(--accent-bright)"
                            : t.result === "own"
                              ? "#cfe3d4"
                              : "#9db8a6",
                      }}
                    >
                      {owner?.name}
                      {t.result === "pot" ? " · takes it" : t.result === "own" ? " · keeps own" : ""}
                    </span>
                  </div>
                );
              })}
              {table.length === 0 && trickStage === "choose" && (
                <span style={{ color: "#5f7a68" }} className="text-sm">
                  The table is empty — make your move
                </span>
              )}
            </div>
            {props.humanActive && !props.humanPlayed && trickStage === "choose" && (
              <div className="mt-4 w-44" aria-hidden>
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(props.playClock / PLAY_SECONDS) * 100}%`,
                      background:
                        props.playClock < 3 ? "#e05545" : "var(--accent-bright)",
                      transition: "width 0.1s linear",
                    }}
                  />
                </div>
                <p className="mt-1 text-center text-[11px]" style={{ color: "#9db8a6" }}>
                  {Math.ceil(props.playClock)}s — or a random card plays itself
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* human area */}
      {human && inLevel2 && (
        <div className="mt-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <AvatarMedallion avatar={human.avatar} size={40} active={props.humanActive && !props.humanPlayed} />
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {human.name}
                  {human.streak >= 2 && (
                    <span className="ml-2 text-xs font-bold" style={{ color: "var(--accent-bright)" }}>
                      STREAK ×{human.streak}
                    </span>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--dim)" }}>
                  Collected this round: {human.collected}
                </div>
              </div>
            </div>
            <CollectedPile count={human.collected} />
          </div>
          <div
            className="mt-2 flex gap-1.5 overflow-x-auto pb-1 pt-1"
            role="group"
            aria-label="Your hand"
          >
            {human.hand.map((card, i) => (
              <button
                key={card.id}
                onClick={() => props.onPlay(card)}
                disabled={phase !== "play" || trickStage !== "choose" || props.humanPlayed}
                aria-label={`Play ${RANK_LABEL[card.rank]}`}
                className="transition-transform enabled:hover:-translate-y-2 enabled:active:scale-95 disabled:opacity-70"
                style={{ marginLeft: i === 0 ? 0 : -14, zIndex: i }}
              >
                <FaceCardView card={card} />
              </button>
            ))}
            {human.hand.length === 0 && phase === "play" && (
              <p className="py-4 text-sm" style={{ color: "var(--dim)" }}>
                No cards left — watch the bots finish the level.
              </p>
            )}
          </div>
        </div>
      )}

      {phase === "roundEnd" && (
        <SummaryOverlay
          title={`Round ${round}/3 — Level 2 complete`}
          players={players}
          primaryLabel={round < 3 ? `Start Round ${round + 1}/3` : "See final results"}
          onPrimary={props.onNextRound}
        />
      )}
      {phase === "gameEnd" && human && (
        <div
          className="fade-up mt-3 rounded-2xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--accent)" }}
        >
          <h2
            className="font-display text-center text-2xl font-bold tracking-[0.1em]"
            style={{ color: "var(--accent-bright)" }}
          >
            {humanWonGame ? "YOU TAKE THE TABLE" : `${sorted[0]?.name ?? ""} TAKES THE TABLE`}
          </h2>
          <p className="mt-1 text-center text-sm" style={{ color: "var(--dim)" }}>
            Your rounds: {human.roundScores.join(" + ")} = {human.totalScore}
            {human.bestStreak >= 2 ? ` · best streak ×${human.bestStreak}` : ""}
          </p>
          <ol className="mt-4 space-y-2">
            {sorted.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border px-3 py-2"
                style={{
                  borderColor: i === 0 ? "var(--accent)" : "var(--border)",
                  background: i === 0 ? "var(--surface-2)" : "transparent",
                }}
              >
                <span className="font-display w-6 text-center font-bold" style={{ color: "var(--dim)" }}>
                  {i + 1}
                </span>
                <AvatarMedallion avatar={p.avatar} size={34} />
                <span className="flex-1 text-sm font-medium" style={{ color: "var(--text)" }}>
                  {p.name} {p.isBot ? "" : "(you)"}
                </span>
                <span className="text-xs" style={{ color: "var(--dim)" }}>
                  {p.roundScores.join(" + ")}
                </span>
                <span className="font-display text-lg font-bold" style={{ color: "var(--accent-bright)" }}>
                  {p.totalScore}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={props.onPlayAgain}
              className="font-display rounded-xl py-3 font-bold tracking-[0.1em] text-black active:scale-[0.98]"
              style={{ background: "var(--gold-grad)" }}
            >
              PLAY AGAIN
            </button>
            <button
              onClick={props.onQuit}
              className="rounded-xl border py-3 font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              Back to lobby
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={props.label}
      onClick={props.onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border active:scale-95"
      style={{
        borderColor: "var(--border)",
        color: "var(--dim)",
        background: "var(--surface)",
      }}
    >
      {props.children}
    </button>
  );
}

function OpponentSeat(props: {
  bot: PlayerState;
  phase: Phase;
  playedCard: TablePlay | undefined;
}) {
  const { bot, phase } = props;
  const inL2 = phase === "pick" || phase === "play";
  return (
    <div
      className="flex flex-col items-center rounded-xl border px-2 py-2 text-center"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <AvatarMedallion avatar={bot.avatar} size={38} />
      <div className="mt-1 text-xs font-semibold" style={{ color: "var(--text)" }}>
        {bot.name}
        {bot.streak >= 2 && (
          <span style={{ color: "var(--accent-bright)" }}> ×{bot.streak}</span>
        )}
      </div>
      {(phase === "l1deal" || phase === "l1result") && (
        <div className="text-[11px]" style={{ color: "var(--dim)" }}>
          sum{" "}
          <strong key={bot.l1Sum} className="score-tick inline-block" style={{ color: "var(--accent-bright)" }}>
            {bot.l1Sum}
          </strong>
          {phase === "l1result" && <> → {bot.startDraws} cards</>}
        </div>
      )}
      {inL2 && (
        <>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex -space-x-3" aria-hidden>
              {Array.from({ length: Math.min(3, bot.hand.length) }).map((_, i) => (
                <span
                  key={i}
                  className="inline-block h-6 w-4 rounded-[3px] border"
                  style={{ background: "#171208", borderColor: "#8a6d14" }}
                />
              ))}
            </span>
            <span className="text-[11px]" style={{ color: "var(--dim)" }}>
              {bot.hand.length} in hand
            </span>
            <CollectedPile count={bot.collected} />
          </div>
        </>
      )}
      {(phase === "roundEnd" || phase === "gameEnd") && (
        <div className="text-[11px]" style={{ color: "var(--dim)" }}>
          total{" "}
          <strong style={{ color: "var(--accent-bright)" }}>{bot.totalScore}</strong>
        </div>
      )}
    </div>
  );
}

function Level1Area(props: {
  players: PlayerState[];
  phase: Phase;
  onSkip: () => void;
}) {
  const { players, phase } = props;
  const human = players.find((p) => !p.isBot);
  return (
    <div>
      <div className="space-y-3">
        {players.map((p) => (
          <div key={p.id} className="flex items-start gap-2">
            <AvatarMedallion avatar={p.avatar} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold" style={{ color: "#f5efe0" }}>
                  {p.name} {p.isBot ? "" : "(you)"}
                </span>
                <span className="text-xs" style={{ color: "#9db8a6" }}>
                  sum{" "}
                  <strong
                    key={p.l1Sum}
                    className="score-tick font-display inline-block text-base"
                    style={{ color: "var(--accent-bright)" }}
                  >
                    {p.l1Sum}
                  </strong>
                  {phase === "l1result" && (
                    <span style={{ color: "#f5efe0" }}>
                      {" "}→ tens digit {p.startDraws} → draws {p.startDraws} + Jester
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.l1Cards.map((c) => (
                  <NumberCardView key={c.id} card={c} />
                ))}
                {p.l1Cards.length === 0 && (
                  <span className="text-xs" style={{ color: "#5f7a68" }}>
                    waiting for the deal…
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {phase === "l1deal" && (
        <div className="mt-3 text-center">
          <button
            onClick={props.onSkip}
            className="rounded-full border px-4 py-1.5 text-xs font-semibold"
            style={{ borderColor: "#3f5a49", color: "#cfe3d4" }}
          >
            Skip the deal
          </button>
        </div>
      )}
      {human && phase === "l1result" && (
        <p className="mt-3 text-center text-sm" style={{ color: "#cfe3d4" }}>
          Your {human.l1Sum} means {human.startDraws} starting cards in Level 2 — plus your Jester.
        </p>
      )}
    </div>
  );
}

function PickArea(props: {
  picksLeft: number;
  pickClock: number;
  deckCount: number;
  onPick: () => void;
}) {
  const backs = Math.min(props.deckCount, 24);
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center">
      <p className="text-center text-sm font-medium" style={{ color: "#f5efe0" }}>
        {props.picksLeft > 0
          ? `Tap the deck to pick your starting cards — ${props.picksLeft} to go`
          : "Your hand is set. The Jester joins it…"}
      </p>
      <div className="mt-2 w-44" aria-hidden>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${(props.pickClock / PICK_SECONDS) * 100}%`,
              background: "var(--accent-bright)",
              transition: "width 0.1s linear",
            }}
          />
        </div>
      </div>
      <div className="mt-4 flex max-w-sm flex-wrap justify-center gap-1.5">
        {Array.from({ length: backs }).map((_, i) => (
          <button
            key={i}
            onClick={props.onPick}
            disabled={props.picksLeft <= 0}
            aria-label="Pick a card from the deck"
            className="transition-transform enabled:hover:-translate-y-1.5 enabled:active:scale-95 disabled:opacity-40"
            style={{ marginLeft: i === 0 ? 0 : -18 }}
          >
            <CardBack small />
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs" style={{ color: "#9db8a6" }}>
        Bots have drawn theirs. Unpicked cards are dealt to you when the clock runs out.
      </p>
    </div>
  );
}

function SummaryOverlay(props: {
  title: string;
  players: PlayerState[];
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const sorted = [...props.players].sort((a, b) => b.totalScore - a.totalScore);
  return (
    <div
      className="fade-up mt-3 rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2
        className="font-display text-center text-xl font-bold tracking-[0.08em]"
        style={{ color: "var(--accent-bright)" }}
      >
        {props.title}
      </h2>
      <ol className="mt-4 space-y-2">
        {sorted.map((p) => {
          const roundScore = p.roundScores[p.roundScores.length - 1] ?? 0;
          return (
            <li key={p.id} className="flex items-center gap-3 px-1">
              <AvatarMedallion avatar={p.avatar} size={32} />
              <span className="flex-1 text-sm" style={{ color: "var(--text)" }}>
                {p.name} {p.isBot ? "" : "(you)"}
              </span>
              <span className="text-sm" style={{ color: "var(--dim)" }}>
                +{roundScore} this round
              </span>
              <span className="font-display text-lg font-bold" style={{ color: "var(--accent-bright)" }}>
                {p.totalScore}
              </span>
            </li>
          );
        })}
      </ol>
      <button
        onClick={props.onPrimary}
        className="font-display mt-5 w-full rounded-xl py-3 font-bold tracking-[0.1em] text-black active:scale-[0.98]"
        style={{ background: "var(--gold-grad)" }}
      >
        {props.primaryLabel.toUpperCase()}
      </button>
    </div>
  );
}

/* ================= rules ================= */

function RulesModal(props: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      style={{ background: "rgba(0,0,0,0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-label="How to play CardMaster"
      onClick={props.onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-6 sm:rounded-2xl"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold tracking-[0.08em]" style={{ color: "var(--accent-bright)" }}>
            HOW TO PLAY
          </h2>
          <button
            aria-label="Close rules"
            onClick={props.onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: "var(--border)", color: "var(--dim)" }}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 space-y-3 text-sm leading-6" style={{ color: "var(--text)" }}>
          <p>
            A game is <strong>3 rounds</strong>. Every round is Level 1, then Level 2.
            The highest total after Round 3 takes the table.
          </p>
          <p>
            <strong style={{ color: "var(--accent-bright)" }}>Level 1 — the deal.</strong>{" "}
            One deck of 2–10 for every player at the table, shuffled together and
            dealt out in order. Add up your cards: the <em>tens digit</em> of your
            sum (47 → 4) is how many cards you draw to start Level 2. Level 1
            scores nothing itself.
          </p>
          <p>
            <strong style={{ color: "var(--accent-bright)" }}>Level 2 — the duel.</strong>{" "}
            The deck is J, Q, K, A (four of each, per player) plus one extra
            Jester — and everyone also gets a Jester in hand. Pick your starting
            cards from the deck, then each trick everyone plays one card
            face-down and all flip together.
          </p>
          <p>
            Rank: <strong>Jester &gt; A &gt; K &gt; Q &gt; J</strong>. The highest
            card collects every card played — 1 point each. If the top cards
            tie, those cards burn straight into their owners' collected piles,
            and the remaining cards are compared again (A beats Q, and so on).
            Played cards are burnt: collected cards never come back.
          </p>
          <p>
            After each trick, you draw new cards from the deck equal to the
            number you just collected — win big, reload big. Collect nothing and
            your hand shrinks. Level 2 ends when fewer than two players hold a
            card. Your round score is the cards you collected; your game total
            is all three rounds added up.
          </p>
          <p style={{ color: "var(--dim)" }}>
            Stalling costs you: if the play clock runs out, a random card from
            your hand plays itself.
          </p>
        </div>
      </div>
    </div>
  );
}
