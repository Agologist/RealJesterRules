// Card and avatar rendering for CardMaster — black & gold, all CSS/SVG.

import type { FaceCard, FaceRank, NumberCard } from "./engine";
import { RANK_LABEL } from "./engine";

export interface AvatarDef {
  id: string;
  glyph: string;
  label: string;
  /** ring / medallion colors */
  bg: string;
  fg: string;
}

export const AVATARS: AvatarDef[] = [
  { id: "crown", glyph: "♛", label: "The Crown", bg: "#2a2110", fg: "#f0d060" },
  { id: "spade", glyph: "♠", label: "The Spade", bg: "#14161c", fg: "#e8e4da" },
  { id: "star", glyph: "★", label: "The Star", bg: "#241028", fg: "#e9b8ff" },
  { id: "flame", glyph: "♜", label: "The Rook", bg: "#2b1408", fg: "#ffb066" },
  { id: "wave", glyph: "♞", label: "The Knight", bg: "#0c2231", fg: "#8fd8ff" },
  { id: "leaf", glyph: "♣", label: "The Club", bg: "#0f2a18", fg: "#9fe8b0" },
];

export function avatarById(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? (AVATARS[0] as AvatarDef);
}

export function AvatarMedallion({
  avatar,
  size = 44,
  active = false,
}: {
  avatar: AvatarDef;
  size?: number;
  active?: boolean;
}) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, ${avatar.bg}, #0c0a08 78%)`,
        color: avatar.fg,
        border: `2px solid ${active ? "#f0d060" : "#c9a227"}`,
        boxShadow: active
          ? "0 0 14px rgba(240,208,96,0.55)"
          : "0 2px 8px rgba(0,0,0,0.5)",
        fontSize: size * 0.52,
        lineHeight: 1,
      }}
    >
      {avatar.glyph}
    </div>
  );
}

const cardBase =
  "relative shrink-0 select-none rounded-[7px] border flex flex-col items-center justify-center font-display";

function JesterHat() {
  return (
    <svg viewBox="0 0 48 30" className="w-8" aria-hidden fill="#0c0a08">
      <path d="M6 22 Q2 8 10 4 Q13 12 18 13 Q20 4 24 3 Q28 4 30 13 Q35 12 38 4 Q46 8 42 22 Q24 15 6 22 Z" />
      <circle cx="9" cy="24" r="3" />
      <circle cx="24" cy="20" r="3" />
      <circle cx="39" cy="24" r="3" />
    </svg>
  );
}

export function FaceCardView({
  card,
  small = false,
  glow = false,
  dim = false,
}: {
  card: FaceCard;
  small?: boolean;
  glow?: boolean;
  dim?: boolean;
}) {
  const isJester = card.rank === "JESTER";
  const w = small ? "w-10 h-14" : "w-14 h-20";
  if (isJester) {
    return (
      <div
        className={`${cardBase} ${w} ${glow ? "winner-glow" : ""}`}
        style={{
          background: "linear-gradient(155deg,#f6dd7a,#c9a227 60%,#97791a)",
          borderColor: "#ffe98a",
          color: "#0c0a08",
          opacity: dim ? 0.45 : 1,
        }}
      >
        <JesterHat />
        <span
          className="font-bold tracking-wide"
          style={{ fontSize: small ? 8 : 10, letterSpacing: "0.12em" }}
        >
          JESTER
        </span>
      </div>
    );
  }
  return (
    <div
      className={`${cardBase} ${w} ${glow ? "winner-glow" : ""}`}
      style={{
        background: "linear-gradient(155deg,#241d12,#100d09 70%)",
        borderColor: "#c9a227",
        color: "#f0d060",
        opacity: dim ? 0.45 : 1,
      }}
    >
      <span
        className="absolute font-semibold"
        style={{ top: 3, left: 5, fontSize: small ? 9 : 11 }}
      >
        {RANK_LABEL[card.rank as FaceRank]}
      </span>
      <span style={{ fontSize: small ? 22 : 32 }} className="font-bold">
        {RANK_LABEL[card.rank as FaceRank]}
      </span>
      <span style={{ fontSize: small ? 8 : 10, color: "#a2937a" }}>◆</span>
    </div>
  );
}

export function NumberCardView({ card }: { card: NumberCard }) {
  return (
    <div
      className={`${cardBase} deal-in w-9 h-[3.25rem]`}
      style={{
        background: "linear-gradient(155deg,#241d12,#100d09 70%)",
        borderColor: "#8a6d14",
        color: "#f5efe0",
      }}
    >
      <span className="text-lg font-bold">{card.value}</span>
    </div>
  );
}

export function CardBack({
  small = false,
  className = "",
}: {
  small?: boolean;
  className?: string;
}) {
  const w = small ? "w-10 h-14" : "w-14 h-20";
  return (
    <div
      aria-hidden
      className={`${cardBase} ${w} ${className}`}
      style={{
        background:
          "repeating-linear-gradient(45deg,#171208 0 6px,#1f180b 6px 12px)",
        borderColor: "#c9a227",
        color: "#c9a227",
      }}
    >
      <span style={{ fontSize: small ? 14 : 20 }}>◆</span>
    </div>
  );
}

/** A fanned stack representing a collected pile, with a count badge. */
export function CollectedPile({ count }: { count: number }) {
  return (
    <div className="relative" style={{ width: 34, height: 44 }} aria-label={`${count} collected cards`}>
      <div
        className="absolute rounded-[5px] border"
        style={{
          inset: 0,
          transform: "rotate(-7deg) translate(-2px, 2px)",
          background: "#100d09",
          borderColor: "#5c4a16",
        }}
      />
      <div
        className="absolute rounded-[5px] border flex items-center justify-center font-display font-bold"
        style={{
          inset: 0,
          transform: "rotate(3deg)",
          background: "linear-gradient(155deg,#241d12,#100d09 70%)",
          borderColor: "#c9a227",
          color: "#f0d060",
          fontSize: 15,
        }}
      >
        {count}
      </div>
    </div>
  );
}
