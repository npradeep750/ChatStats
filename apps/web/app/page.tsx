"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  MotionValue,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const superPop = {
  hidden: { opacity: 0, scale: 0.6, y: 10 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 22 },
  },
};

const steps = [
  {
    num: "01",
    title: "Upload your chat",
    body: "Export your iMessage group chat as a database or JSON file and drop it in. Everything happens in your browser.",
  },
  {
    num: "02",
    title: "We analyze everything",
    body: "Our pipeline parses every message and computes reply times, reactions, message content, etc.",
  },
  {
    num: "03",
    title: "Crown your superlatives",
    body: "Flip through an animated deck that reveals the Main Character, Night Owl, Emoji Addict, etc.",
  },
];

const superlativeCategories = [
  {
    emblem: "timing",
    from: "#8fd3f7",
    to: "#155a8e",
    title: "Group Activity",
    blurb: "When and how often participants send messages.",
    items: [
      { label: "Night Owl", emoji: "🌙" },
      { label: "Early Bird", emoji: "🐦" },
      { label: "Time Traveler", emoji: "⏳" },
      { label: "Quick Draw", emoji: "⚡" },
    ],
  },
  {
    emblem: "words",
    from: "#ffd0e6",
    to: "#e2709f",
    title: "Message Data",
    blurb: "The hidden patterns and trends in particiapant's messages.",
    items: [
      { label: "Wordsmith", emoji: "✍️" },
      { label: "Novelist", emoji: "📚" },
      { label: "Grammar Police", emoji: "🕵️" },
    ],
  },
  {
    emblem: "love",
    from: "#ffd9a8",
    to: "#e08a3c",
    title: "Polarizing Figures",
    blurb: "Who controls the conversation and who doesn't.",
    items: [
      { label: "Main Character", emoji: "👑" },
      { label: "Conversation Starter", emoji: "💬" },
      { label: "Trendsetter", emoji: "💅" },
      { label: "Ghost", emoji: "👻" },
    ],
  },
  {
    emblem: "volume",
    from: "#b7a6f5",
    to: "#6d5ad6",
    title: "Conversation Habits",
    blurb: "How each participant interacts with the conversation.",
    items: [
      { label: "Media Spammer", emoji: "🎬" },
      { label: "Emoji Addict", emoji: "😂" },
      { label: "Double Texter", emoji: "📲" },
    ],
  },
] as const;

const marqueeItems = [
  { label: "Main Character", emoji: "👑" },
  { label: "Night Owl", emoji: "🌙" },
  { label: "Emoji Addict", emoji: "😂" },
  { label: "Wordsmith", emoji: "✍️" },
  { label: "Quick Draw", emoji: "⚡" },
  { label: "Ghost", emoji: "👻" },
  { label: "Novelist", emoji: "📚" },
  { label: "Trendsetter", emoji: "💅" },
  { label: "Time Traveler", emoji: "⏳" },
  { label: "Conversation Starter", emoji: "💬" },
];

const demoTitleLabels: Record<string, string> = {
  main_character: "The Main Character",
  novelist: "The Novelist",
  double_texter: "The Double Texter",
  conversation_starter: "The Conversation Starter",
  night_owl: "The Night Owl",
  early_bird: "The Early Bird",
  emoji_addict: "The Emoji Addict",
  media_spammer: "The Media Spammer",
  quick_draw: "The Prompt Responder",
  ghost: "The Ghost",
  time_traveler: "The Time Traveler",
  grammar_police: "The Grammar Police",
  wordsmith: "The Wordsmith",
  trendsetter: "The Trendsetter",
};

const demoDescriptions: Record<string, string> = {
  main_character:
    "The participant whose messages get the most reactions across the conversation.",
  double_texter:
    "The participant most likely to send multiple messages in a row.",
  novelist:
    "The participant who writes the longest messages on average, based on word count.",
  conversation_starter:
    "The participant who starts the conversation most after at least four hours of silence.",
  night_owl:
    "The participant with the most messages sent between midnight and 6 a.m.",
  early_bird:
    "The participant with the most messages sent between 6 a.m. and 9 a.m.",
  emoji_addict: "The participant who uses the most emojis.",
  media_spammer:
    "The participant who uses the most photos, videos, files, and links.",
  quick_draw:
    "The participant with the fastest typical reply time to another participant.",
  ghost:
    "The participant with the fewest messages in this selected conversation.",
  time_traveler:
    "The participant most likely to reply four or more hours after the group has gone quiet.",
  grammar_police:
    "The participant who uses the most sentence-ending punctuation, capitalization, etc.",
  wordsmith:
    "The participant with the largest unique vocabulary, excluding common filler words.",
  trendsetter: "The participant who introduces vocabulary that others pick up.",
};

type DemoRow = {
  participant: string;
  ranking_score?: number;
  score?: number;
  total_reactions?: number;
  reaction_rate?: number;
  rate?: number;
  max_run?: number;
  average_words?: number;
  eligible_messages?: number;
  longest_message_words?: number;
  long_gap_starts?: number;
  starts_per_100_messages?: number;
  share?: number;
  messages?: number;
  total_emojis?: number;
  per_100_messages?: number;
  total_media_items?: number;
  median_reply_seconds?: number;
  reply_count?: number;
  message_count?: number;
  message_share?: number;
  active_days?: number;
  late_reply_count?: number;
  average_late_hours?: number;
  longest_late_hours?: number;
  grammar_score?: number;
  proper_punctuation_rate?: number;
  capitalization_rate?: number;
  unique_words?: number;
  total_words?: number;
  minimum_sample?: number;
  first_use_terms?: number;
};

const demoSlides: Array<{
  key: string;
  winner: DemoRow;
  second: DemoRow;
  third: DemoRow;
}> = [
  {
    key: "main_character",
    winner: {
      participant: "Riley",
      ranking_score: 482,
      score: 482,
      total_reactions: 2140,
      reaction_rate: 0.34,
    },
    second: {
      participant: "Sam",
      ranking_score: 391,
      score: 391,
      total_reactions: 1720,
      reaction_rate: 0.29,
    },
    third: {
      participant: "Jordan",
      ranking_score: 347,
      score: 347,
      total_reactions: 1510,
      reaction_rate: 0.26,
    },
  },
  {
    key: "night_owl",
    winner: { participant: "Jordan", share: 0.38, messages: 512 },
    second: { participant: "Riley", share: 0.27, messages: 364 },
    third: { participant: "Casey", share: 0.19, messages: 261 },
  },
  {
    key: "emoji_addict",
    winner: {
      participant: "Sam",
      ranking_score: 614,
      total_emojis: 1830,
      per_100_messages: 45,
    },
    second: {
      participant: "Riley",
      ranking_score: 502,
      total_emojis: 1470,
      per_100_messages: 38,
    },
    third: {
      participant: "Jordan",
      ranking_score: 411,
      total_emojis: 1190,
      per_100_messages: 31,
    },
  },
  {
    key: "wordsmith",
    winner: {
      participant: "Casey",
      unique_words: 1204,
      total_words: 8900,
      eligible_messages: 410,
      minimum_sample: 20,
    },
    second: {
      participant: "Sam",
      unique_words: 987,
      total_words: 7230,
      eligible_messages: 382,
      minimum_sample: 20,
    },
    third: {
      participant: "Riley",
      unique_words: 742,
      total_words: 6140,
      eligible_messages: 355,
      minimum_sample: 20,
    },
  },
  {
    key: "novelist",
    winner: {
      participant: "Casey",
      average_words: 145,
      eligible_messages: 264,
      longest_message_words: 89,
    },
    second: {
      participant: "Riley",
      average_words: 118,
      eligible_messages: 240,
      longest_message_words: 72,
    },
    third: {
      participant: "Sam",
      average_words: 97,
      eligible_messages: 231,
      longest_message_words: 64,
    },
  },
  {
    key: "double_texter",
    winner: { participant: "Sam", rate: 68, max_run: 9 },
    second: { participant: "Riley", rate: 54, max_run: 7 },
    third: { participant: "Alex", rate: 47, max_run: 6 },
  },
  {
    key: "conversation_starter",
    winner: {
      participant: "Taylor",
      ranking_score: 413,
      long_gap_starts: 58,
      starts_per_100_messages: 6,
    },
    second: {
      participant: "Riley",
      ranking_score: 371,
      long_gap_starts: 51,
      starts_per_100_messages: 5,
    },
    third: {
      participant: "Jordan",
      ranking_score: 322,
      long_gap_starts: 45,
      starts_per_100_messages: 5,
    },
  },
  {
    key: "early_bird",
    winner: { participant: "Casey", share: 0.31, messages: 421 },
    second: { participant: "Sam", share: 0.24, messages: 328 },
    third: { participant: "Jordan", share: 0.18, messages: 244 },
  },
  {
    key: "media_spammer",
    winner: {
      participant: "Riley",
      ranking_score: 528,
      total_media_items: 912,
      per_100_messages: 21,
    },
    second: {
      participant: "Casey",
      ranking_score: 466,
      total_media_items: 803,
      per_100_messages: 18,
    },
    third: {
      participant: "Taylor",
      ranking_score: 391,
      total_media_items: 674,
      per_100_messages: 15,
    },
  },
  {
    key: "quick_draw",
    winner: {
      participant: "Riley",
      median_reply_seconds: 12.4,
      reply_count: 620,
    },
    second: {
      participant: "Sam",
      median_reply_seconds: 18.7,
      reply_count: 571,
    },
    third: {
      participant: "Casey",
      median_reply_seconds: 24.2,
      reply_count: 489,
    },
  },
  {
    key: "ghost",
    winner: {
      participant: "Alex",
      message_count: 214,
      message_share: 0.03,
      active_days: 41,
    },
    second: {
      participant: "Taylor",
      message_count: 492,
      message_share: 0.06,
      active_days: 87,
    },
    third: {
      participant: "Casey",
      message_count: 1410,
      message_share: 0.17,
      active_days: 152,
    },
  },
  {
    key: "time_traveler",
    winner: {
      participant: "Riley",
      late_reply_count: 83,
      average_late_hours: 6.4,
      longest_late_hours: 47,
    },
    second: {
      participant: "Jordan",
      late_reply_count: 71,
      average_late_hours: 6.1,
      longest_late_hours: 39,
    },
    third: {
      participant: "Sam",
      late_reply_count: 64,
      average_late_hours: 5.7,
      longest_late_hours: 33,
    },
  },
  {
    key: "grammar_police",
    winner: {
      participant: "Casey",
      grammar_score: 884,
      proper_punctuation_rate: 92,
      capitalization_rate: 88,
    },
    second: {
      participant: "Riley",
      grammar_score: 811,
      proper_punctuation_rate: 87,
      capitalization_rate: 84,
    },
    third: {
      participant: "Sam",
      grammar_score: 763,
      proper_punctuation_rate: 83,
      capitalization_rate: 79,
    },
  },
  {
    key: "trendsetter",
    winner: { participant: "Sam", first_use_terms: 142 },
    second: { participant: "Casey", first_use_terms: 117 },
    third: { participant: "Jordan", first_use_terms: 89 },
  },
];

const demoParticipants = 6;

const showcaseSlides = ["main_character", "emoji_addict", "time_traveler"]
  .map((key) => demoSlides.find((s) => s.key === key))
  .filter((s): s is (typeof demoSlides)[number] => Boolean(s));

function demoPodiumPrimaryStat(key: string, row: DemoRow): string {
  if (key === "main_character")
    return `${row.ranking_score ?? row.score ?? 0} score`;
  if (key === "double_texter") return `${row.rate ?? 0}% rate`;
  if (key === "novelist") return `${row.average_words ?? 0} avg words`;
  if (key === "conversation_starter") return `${row.ranking_score ?? 0} score`;
  if (key === "night_owl" || key === "early_bird")
    return `${Math.round((row.share ?? 0) * 100)}% share`;
  if (key === "emoji_addict") return `${row.ranking_score ?? 0} score`;
  if (key === "media_spammer") return `${row.ranking_score ?? 0} score`;
  if (key === "quick_draw")
    return row.median_reply_seconds != null
      ? `${row.median_reply_seconds.toFixed(1)}s median`
      : `${row.reply_count ?? 0} replies`;
  if (key === "ghost") return `${row.message_count ?? 0} messages`;
  if (key === "time_traveler")
    return `${row.late_reply_count ?? 0} late returns`;
  if (key === "grammar_police") return `${row.grammar_score ?? 0} score`;
  if (key === "wordsmith") return `${row.unique_words ?? 0} unique words`;
  if (key === "trendsetter") return `${row.first_use_terms ?? 0} adopted words`;
  return "";
}

function demoRankingDetail(key: string, row: DemoRow): string {
  if (key === "main_character")
    return `${row.ranking_score ?? row.score ?? 0} main character score · ${row.total_reactions ?? 0} reactions · ${row.reaction_rate ?? 0}% of messages reacted to`;
  if (key === "double_texter")
    return `${row.rate ?? 0}% double-text rate · longest run ${row.max_run ?? 0} messages`;
  if (key === "novelist") {
    const longWords = row.longest_message_words ?? 0;
    return (
      `${row.average_words ?? 0} average words · ${row.eligible_messages ?? 0} text messages · longest message ` +
      (longWords > 0 ? `${longWords} words` : "")
    );
  }
  if (key === "conversation_starter")
    return `${row.ranking_score ?? 0} starting score · ${row.long_gap_starts ?? 0} starts after 4+ hours · ${row.starts_per_100_messages ?? 0} starts per 100 messages`;
  if (key === "night_owl")
    return `${Math.round((row.share ?? 0) * 100)}% of messages from midnight–6 a.m. · ${row.messages ?? 0} messages`;
  if (key === "early_bird")
    return `${Math.round((row.share ?? 0) * 100)}% of messages from 6–9 a.m. · ${row.messages ?? 0} messages`;
  if (key === "emoji_addict")
    return `${row.ranking_score ?? 0} emoji score · ${row.total_emojis ?? 0} emojis total · ${row.per_100_messages ?? 0} per 100 messages`;
  if (key === "media_spammer")
    return `${row.ranking_score ?? 0} media score · ${row.total_media_items ?? 0} media/link items total · ${row.per_100_messages ?? 0} per 100 messages`;
  if (key === "quick_draw")
    return row.median_reply_seconds === null ||
      row.median_reply_seconds === undefined
      ? `${row.reply_count ?? 0} replies recorded`
      : `${(row.median_reply_seconds ?? 0).toFixed(1)} seconds median reply · ${row.reply_count ?? 0} replies`;
  if (key === "ghost")
    return `${row.message_count ?? 0} messages · ${Math.round((row.message_share ?? 0) * 100)}% of the conversation · ${row.active_days ?? 0} active days`;
  if (key === "time_traveler")
    return `${row.late_reply_count ?? 0} late returns · ${row.average_late_hours ?? 0} hours avg delay · longest ${row.longest_late_hours ?? 0} hours`;
  if (key === "grammar_police")
    return `${row.grammar_score ?? 0} grammar score · ${row.proper_punctuation_rate ?? 0}% punctuation · ${row.capitalization_rate ?? 0}% capitalization`;
  if (key === "wordsmith")
    return `${row.unique_words ?? 0} unique words · ${row.total_words ?? 0} words total · ${row.eligible_messages ?? 0} messages (needs ${row.minimum_sample ?? 20})`;
  if (key === "trendsetter")
    return `${row.first_use_terms ?? 0} words they introduced that others adopted`;
  return "";
}

function demoFullRanking(key: string): DemoRow[] {
  const slide = demoSlides.find((s) => s.key === key);
  if (!slide) return [];
  const topThree = [slide.winner, slide.second, slide.third];
  const allNames = ["Riley", "Sam", "Jordan", "Casey", "Alex", "Taylor"];
  const used = new Set(topThree.map((r) => r.participant));
  const fillerNames = allNames.filter((n) => !used.has(n));

  const factors = [0.72, 0.55, 0.4];
  const filler: DemoRow[] = fillerNames.map((participant, i) => {
    const base = slide.third;
    const f = factors[i] ?? 0.3;
    const row: DemoRow = { participant };
    for (const key of Object.keys(base)) {
      const v = base[key as keyof DemoRow];
      if (typeof v === "number") {
        (row as Record<string, string | number | undefined>)[key] = Math.max(
          1,
          Math.round(v * f),
        );
      }
    }
    return row;
  });
  return [...topThree, ...filler];
}

const navLinks = [
  { label: "Demo", href: "#demo" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Superlatives", href: "#superlatives" },
];

type EmblemKind = "timing" | "words" | "love" | "volume";

function SuperEmblem({ kind }: { kind: EmblemKind }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "timing":
      return (
        <svg {...common}>
          <circle cx="12" cy="14" r="7" />
          <rect x="10.5" y="3" width="3" height="2.5" rx="1" />
          <rect x="9" y="2" width="6" height="2" rx="1" />
          <line x1="12" y1="14" x2="12" y2="8" />
          <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
          <line x1="12" y1="8" x2="14" y2="10" />
        </svg>
      );
    case "words":
      return (
        <svg {...common}>
          <path d="M16 2 L8 16 L12 12 L16 2Z" />
          <path d="M8 16 L6 22 L12 12" />
          <circle cx="7" cy="21" r="1.5" fill="currentColor" stroke="none" />
          <line x1="18" y1="2" x2="20" y2="4" />
          <line x1="20" y1="2" x2="18" y2="4" />
        </svg>
      );
    case "love":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="13" rx="4" />
          <path d="M2 15 Q2 20 7 20 L9 17" />
          <path
            d="M12 15 C12 15 9 12.5 9 10.5 A1.8 1.8 0 0 1 12 9.8 A1.8 1.8 0 0 1 15 10.5 C15 12.5 12 15 12 15Z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case "volume":
      return (
        <svg {...common}>
          <rect x="3" y="10" width="4" height="10" rx="1.5" />
          <rect x="10" y="5" width="4" height="15" rx="1.5" />
          <rect x="17" y="2" width="4" height="18" rx="1.5" />
          <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="2" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

function MagneticButton({
  children,
  href,
  className,
  onClick,
  target,
  rel,
}: {
  children: React.ReactNode;
  href: string;
  className: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  target?: string;
  rel?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useSpring(0, { stiffness: 260, damping: 18 });
  const y = useSpring(0, { stiffness: 260, damping: 18 });

  function onMove(event: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((event.clientX - (rect.left + rect.width / 2)) * 0.28);
    y.set((event.clientY - (rect.top + rect.height / 2)) * 0.28);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  const resolvedRel =
    rel ?? (target === "_blank" ? "noopener noreferrer" : undefined);

  return (
    <motion.a
      ref={ref}
      href={href}
      target={target}
      rel={resolvedRel}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x, y }}
      whileTap={{ scale: 0.96 }}
      className={className}
    >
      {children}
    </motion.a>
  );
}

function useContainerScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return { scrollRef, progress };
}

function ScrollProgress({ progress }: { progress: MotionValue<number> }) {
  return (
    <motion.div
      className="landing-progress"
      style={{ scaleX: progress }}
      aria-hidden="true"
    />
  );
}

function Nav({
  progress,
  auth,
}: {
  progress: MotionValue<number>;
  auth: LandingAuth;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useMotionValueEvent(progress, "change", (v) => {
    setScrolled(v > 0.02);
  });

  return (
    <header className={`landing-nav${scrolled ? " scrolled" : ""}`}>
      <div className="landing-nav-inner">
        <Link href="/" className="landing-brand" aria-label="Chat Stats home">
          <span className="landing-brand-mark">✦</span>
          CHAT STATS
        </Link>
        <nav className="landing-nav-links" aria-label="Sections">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="landing-nav-link">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav-actions">
          {auth.user ? (
            <div className="landing-account">
              <button
                type="button"
                className={`landing-user-line${menuOpen ? " open" : ""}`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="landing-avatar">
                  {(auth.user.email ?? "?")[0].toUpperCase()}
                </span>
                <span
                  className="landing-user-email"
                  title={auth.user.email ?? "Signed in"}
                >
                  {auth.user.email}
                </span>
              </button>
              {menuOpen && (
                <div className="landing-account-dropdown">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      auth.signOut();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="landing-btn-login"
              onClick={auth.signIn}
              disabled={auth.loading}
            >
              {auth.loading ? "…" : "Log in"}
            </button>
          )}
          <Link
            href="/app"
            className="landing-nav-cta"
            target="_blank"
            rel="noopener noreferrer"
          >
            Try Chat Stats
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

const HERO_REACTIONS = [
  "❤️",
  "😂",
  "👍",
  "👏",
  "🎉",
  "🔥",
  "💯",
  "⚡",
  "🥹",
  "😮",
];

const heroBubbles: Array<{
  top: string;
  left: string;
  width: string;
  variant: "in" | "out";
  bars: string[];
  name: string;
  time: string;
  reactions?: string;
  delay: string;
  duration: string;
}> = [
  {
    top: "13%",
    left: "5%",
    width: "150px",
    variant: "out",
    bars: ["82%", "52%"],
    name: "44px",
    time: "9:41",
    reactions: "😂👍",
    delay: "0s",
    duration: "9s",
  },
  {
    top: "20%",
    left: "79%",
    width: "170px",
    variant: "in",
    bars: ["90%", "60%"],
    name: "40px",
    time: "9:42",
    delay: "-3s",
    duration: "11s",
  },
  {
    top: "60%",
    left: "2%",
    width: "120px",
    variant: "in",
    bars: ["70%", "42%"],
    name: "34px",
    time: "9:47",
    reactions: "❤️👍",
    delay: "-5s",
    duration: "10s",
  },
  {
    top: "72%",
    left: "82%",
    width: "160px",
    variant: "out",
    bars: ["84%", "50%"],
    name: "42px",
    time: "9:52",
    delay: "-7s",
    duration: "12s",
  },
  {
    top: "84%",
    left: "17%",
    width: "130px",
    variant: "out",
    bars: ["60%"],
    name: "36px",
    time: "9:55",
    delay: "-2s",
    duration: "8.5s",
  },
  {
    top: "9%",
    left: "64%",
    width: "110px",
    variant: "in",
    bars: ["64%", "40%"],
    name: "30px",
    time: "9:38",
    reactions: "🔥",
    delay: "-1s",
    duration: "10.5s",
  },
];

function HeroBubbles() {
  return (
    <div className="landing-bubbles" aria-hidden="true">
      {heroBubbles.map((b, i) => (
        <div
          key={i}
          className={`landing-bubble landing-bubble--${b.variant}`}
          style={{
            top: b.top,
            left: b.left,
            width: b.width,
            animationDelay: b.delay,
            animationDuration: b.duration,
          }}
        >
          {b.bars.map((width, j) => (
            <span key={j} className="landing-bubble-bar" style={{ width }} />
          ))}
          <span className="landing-bubble-meta">
            <span className="landing-bubble-name" style={{ width: b.name }} />
            <span className="landing-bubble-time">{b.time}</span>
          </span>
          {b.reactions && (
            <span className="landing-bubble-reactions">{b.reactions}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Hero() {
  const [typedText, setTypedText] = useState("");
  const [phase, setPhase] = useState<"typing" | "sent" | "reacting">("typing");
  const [emojiCount, setEmojiCount] = useState(0);

  useEffect(() => {
    const target = "Find out who really runs the group chat.";
    let i = 0;
    setTypedText("");
    let sendTimer: number | undefined;
    const interval = setInterval(() => {
      i += 1;
      setTypedText(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(interval);
        sendTimer = window.setTimeout(() => setPhase("sent"), 350);
      }
    }, 55);
    return () => {
      clearInterval(interval);
      if (sendTimer != null) window.clearTimeout(sendTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = window.setTimeout(() => setPhase("reacting"), 650);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "reacting") return;
    if (emojiCount >= HERO_REACTIONS.length) return;
    const timer = window.setTimeout(() => setEmojiCount((c) => c + 1), 180);
    return () => window.clearTimeout(timer);
  }, [phase, emojiCount]);

  const typing = phase === "typing";

  return (
    <section className="landing-hero" aria-label="Intro">
      <HeroBubbles />
      <motion.div
        className="landing-hero-inner"
        initial="hidden"
        animate="show"
        variants={stagger}
      >
        <motion.p variants={fadeUp} className="landing-hero-wordmark">
          <img
            src="/crown-gold.svg"
            alt=""
            className="landing-hero-wordmark-crown"
          />
          Chat <span>Stats</span>
        </motion.p>
        <motion.h1 variants={fadeUp} className="landing-h1">
          {typing ? (
            <>
              <span className="landing-h1-msg">{typedText}</span>
              <span className="cursor" aria-hidden="true">
                |
              </span>
            </>
          ) : (
            <motion.span
              className="landing-h1-msg is-sent"
              initial={{ scale: 0.62, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: { type: "spring", stiffness: 300, damping: 17 },
              }}
            >
              {typedText}
              <span className="landing-sent-meta" aria-hidden="true">
                ✓ Sent&nbsp;&nbsp;·&nbsp;&nbsp;now
              </span>
              {phase === "reacting" && emojiCount > 0 && (
                <motion.span
                  className="landing-h1-reactions"
                  aria-hidden="true"
                >
                  <span className="landing-h1-reaction">
                    {HERO_REACTIONS.slice(0, emojiCount).map((e, i) => (
                      <motion.span
                        key={i}
                        initial={{ y: 12, opacity: 0, scale: 0.5 }}
                        animate={{
                          y: 0,
                          opacity: 1,
                          scale: 1,
                          transition: {
                            type: "spring",
                            stiffness: 500,
                            damping: 16,
                          },
                        }}
                      >
                        {e}
                      </motion.span>
                    ))}
                  </span>
                </motion.span>
              )}
            </motion.span>
          )}
        </motion.h1>
        <motion.p variants={fadeUp} className="landing-sub">
          Turns your group chat into a highlight reel by crowning your
          superlatives.
        </motion.p>
        <motion.div variants={fadeUp} className="landing-hero-actions">
          <MagneticButton
            href="/app"
            className="landing-btn-primary"
            target="_blank"
          >
            <span>Try Chat Stats</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </MagneticButton>
          <a href="#how-it-works" className="landing-btn-ghost">
            See how it works
          </a>
        </motion.div>
        <motion.div variants={fadeUp} className="landing-hero-chips">
          <span className="landing-hero-chip">🏆 14+ superlatives</span>
          <span className="landing-hero-chip">⚡ Reply timing</span>
          <span className="landing-hero-chip">🌙 Activity patterns</span>
          <span className="landing-hero-chip">🔒 Stays in your browser</span>
        </motion.div>
      </motion.div>
    </section>
  );
}

function Showcase({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: containerRef,
    target: ref,
    offset: ["start end", "end start"],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [6, 0, -6]);

  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right",
  );
  const [winnerRevealed, setWinnerRevealed] = useState(false);
  const [podiumRevealed, setPodiumRevealed] = useState(false);
  const [winnerSettled, setWinnerSettled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [viewedSlides, setViewedSlides] = useState<Set<number>>(new Set());

  const N = showcaseSlides.length;
  const slide = showcaseSlides[slideIndex];
  const activeKey = slide.key;

  const appBoxRef = useRef<HTMLDivElement>(null);
  const suspenseRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const leftArrowRef = useRef<HTMLButtonElement>(null);
  const rightArrowRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const winnerNameRef = useRef<HTMLHeadingElement>(null);
  const podiumFinalNameRef = useRef<HTMLSpanElement>(null);

  const slideIndexRef = useRef(0);
  const [inView, setInView] = useState(false);
  const [scrolledAway, setScrolledAway] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const root = containerRef.current;
    if (!el || !root) return;
    function checkVisibility() {
      const elRect = el!.getBoundingClientRect();
      const rootRect = root!.getBoundingClientRect();
      const overlapTop = Math.max(elRect.top, rootRect.top);
      const overlapBottom = Math.min(elRect.bottom, rootRect.bottom);
      const overlapHeight = Math.max(0, overlapBottom - overlapTop);
      const visibleFraction = overlapHeight / elRect.height;
      const anyVisible = visibleFraction >= 0.3;
      // For the "scrolled away" reset, only trigger when the element is
      // fully off-screen (top below container or bottom above container).
      // This prevents the expand animation from triggering a false reset.
      const fullyOffScreen =
        elRect.top > rootRect.bottom || elRect.bottom < rootRect.top;
      setInView(anyVisible);
      setScrolledAway(fullyOffScreen);
    }
    checkVisibility();
    root.addEventListener("scroll", checkVisibility, { passive: true });
    window.addEventListener("resize", checkVisibility);
    return () => {
      root.removeEventListener("scroll", checkVisibility);
      window.removeEventListener("resize", checkVisibility);
    };
  }, [containerRef]);

  // Reset the demo when it scrolls completely out of view so it replays fresh.
  useEffect(() => {
    if (!scrolledAway) return;
    setSlideIndex(0);
    slideIndexRef.current = 0;
    setSlideDirection("right");
    setWinnerRevealed(false);
    setPodiumRevealed(false);
    setWinnerSettled(false);
    setExpanded(false);
    setClosing(false);
  }, [scrolledAway]);

  function goToSlide(index: number, direction: "left" | "right") {
    const next = (index + N) % N;
    slideIndexRef.current = next;
    setSlideIndex(next);
    setSlideDirection(direction);
    setWinnerRevealed(false);
    setPodiumRevealed(false);
    setWinnerSettled(false);
    setExpanded(false);
    setClosing(false);
  }

  useEffect(() => {
    setViewedSlides((prev) => new Set(prev).add(slideIndex));
  }, [slideIndex]);

  useEffect(() => {
    if (!podiumRevealed) return;
    const name = winnerNameRef.current;
    const finalName = podiumFinalNameRef.current;
    if (!name || !finalName) return;
    const raf = requestAnimationFrame(() => {
      const from = name.getBoundingClientRect();
      const to = finalName.getBoundingClientRect();
      const FINAL_FONT = 20;
      const curFont =
        parseFloat(window.getComputedStyle(name).fontSize) || FINAL_FONT;
      const scale = FINAL_FONT / curFont;
      const dx = to.left - from.left;
      const dy = to.top - from.top;
      name.style.transformOrigin = "left top";
      name.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    });
    const settle = window.setTimeout(() => {
      setWinnerSettled(true);
    }, 1900);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [podiumRevealed]);

  const restoreScrollRef = useRef<number | null>(null);
  const closeRankingRef = useRef<() => void>(() => {});

  useEffect(() => {
    closeRankingRef.current = () => {
      setExpanded(false);
      setClosing(true);
      window.setTimeout(() => setClosing(false), 1200);
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const raf = requestAnimationFrame(() => {
      const el = expandRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewH = window.innerHeight;
      const elVisible = rect.bottom > 0 && rect.top < viewH;
      if (expanded) {
        if (elVisible) {
          restoreScrollRef.current = container.scrollTop;
          const panel = el.closest(".superlative-deck");
          const panelBottom = panel
            ? panel.getBoundingClientRect().bottom
            : rect.bottom;
          const needsScroll = rect.top < 110 || panelBottom > viewH - 20;
          if (needsScroll) {
            const bottom = panelBottom + container.scrollTop + 40;
            container.scrollTo({
              top: Math.max(0, bottom - viewH),
              behavior,
            });
          }
        } else {
          restoreScrollRef.current = null;
        }
      } else if (restoreScrollRef.current != null) {
        container.scrollTo({
          top: restoreScrollRef.current,
          behavior,
        });
        restoreScrollRef.current = null;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [expanded, containerRef]);

  // Auto-play: starts once when inView first becomes true.
  // Uses a ref for "stopped" so that inView flicker (from expand
  // changing section height) doesn't kill the running async loop.
  const autoPlayStartedRef = useRef(false);
  const stoppedRef = useRef(false);
  useEffect(() => {
    if (!inView) return;
    if (autoPlayStartedRef.current) return;
    autoPlayStartedRef.current = true;
    stoppedRef.current = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function until(test: () => boolean) {
      const start = Date.now();
      while (!test() && !stoppedRef.current) {
        if (Date.now() - start > 12000) return;
        await sleep(40);
      }
    }

    async function press(action: () => void) {
      action();
      await sleep(150);
    }

    (async () => {
      await sleep(1800);
      while (!stoppedRef.current) {
        await until(() => Boolean(suspenseRef.current));
        await press(() => setWinnerRevealed(true));

        await until(() => Boolean(spotlightRef.current));
        await sleep(2600);
        await press(() => setPodiumRevealed(true));

        await sleep(3400);
        const idx = slideIndexRef.current;

        if (idx === 1) {
          await until(() => Boolean(expandRef.current));
          await press(() => {
            setClosing(false);
            setExpanded(true);
          });
          await sleep(3800);
          await press(closeRankingRef.current);
          await sleep(2400);
        }

        if (idx === 2) {
          await sleep(500);
          await press(() => goToSlide(1, "left"));
          await until(() => Boolean(suspenseRef.current));
          await sleep(2400);
          await press(() => goToSlide(2, "right"));
          await until(() => Boolean(suspenseRef.current));
          await sleep(2400);
        }

        await press(() => goToSlide(slideIndexRef.current + 1, "right"));
        await until(() => Boolean(suspenseRef.current));
        await sleep(3000);
      }
    })();
    // No cleanup — the loop is gated by autoPlayStartedRef and
    // stoppedRef so it survives inView flicker.
  }, [inView]);

  // Reset when scrolled fully away so it replays on next visit.
  useEffect(() => {
    if (!scrolledAway) return;
    autoPlayStartedRef.current = false;
    stoppedRef.current = true;
  }, [scrolledAway]);

  const ranking = expanded || closing ? demoFullRanking(activeKey) : [];

  return (
    <section
      id="demo"
      className="landing-showcase"
      ref={ref}
      aria-label="Product preview"
    >
      <motion.div
        className="showcase-tilt"
        style={{ y: parallaxY, rotateX, transformPerspective: 1200 }}
      >
        <div className="showcase-window">
          <div className="showcase-chrome">
            <span
              className="showcase-dot showcase-dot--red"
              aria-hidden="true"
            />
            <span
              className="showcase-dot showcase-dot--amber"
              aria-hidden="true"
            />
            <span
              className="showcase-dot showcase-dot--green"
              aria-hidden="true"
            />
            <span className="showcase-url">chatstats.app/app</span>
          </div>

          <div className="demo-app" ref={appBoxRef}>
            <div className="summary">
              <div>
                <span>Conversation</span>
                <strong>The Dinner Crew</strong>
              </div>
              <div>
                <span>Messages</span>
                <strong>8,412</strong>
              </div>
              <div>
                <span>Participants</span>
                <strong>{demoParticipants}</strong>
              </div>
              <div>
                <span>Reactions</span>
                <strong>1,203</strong>
              </div>
            </div>

            <div className="deck-counter-row">
              <div className="deck-counter">
                SUPERLATIVE {slideIndex + 1} OF {N}
              </div>
              <button
                type="button"
                className="autoplay-toggle"
                aria-label="Playing demo"
                title="Auto-playing demo"
                tabIndex={-1}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
                <span>Auto</span>
              </button>
            </div>

            <div className="deck-stage">
              <div
                className={`superlative-deck${podiumRevealed ? " podium-deck" : ""}`}
              >
                <div
                  key={`${activeKey}-${slideIndex}`}
                  className="deck-slide-content"
                  data-direction={slideDirection}
                >
                  <div className="deck-intro">
                    <span className="deck-category">
                      {demoTitleLabels[activeKey] ?? activeKey}
                    </span>
                    <p>{demoDescriptions[activeKey] ?? ""}</p>
                  </div>
                  <div
                    className={
                      podiumRevealed
                        ? "deck-winner podium"
                        : winnerRevealed
                          ? "deck-winner revealed"
                          : "deck-winner"
                    }
                  >
                    <button
                      type="button"
                      ref={leftArrowRef}
                      className="deck-arrow deck-arrow-left"
                      aria-label="Previous superlative"
                      tabIndex={-1}
                      onClick={() => goToSlide(slideIndex - 1, "left")}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      ref={rightArrowRef}
                      className="deck-arrow deck-arrow-right"
                      aria-label="Next superlative"
                      tabIndex={-1}
                      onClick={() => goToSlide(slideIndex + 1, "right")}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    {!winnerRevealed && (
                      <div ref={suspenseRef} className="winner-suspense">
                        <div className="winner-skeleton">
                          <div className="skeleton-bar skeleton-bar-lg" />
                          <div className="skeleton-bar skeleton-bar-sm" />
                          <div className="skeleton-bar skeleton-bar-md" />
                        </div>
                        <p className="winner-tease">Tap to reveal the winner</p>
                      </div>
                    )}
                    {winnerRevealed && (
                      <div ref={spotlightRef} className="winner-spotlight">
                        <span className="winner-label">1ST PLACE</span>
                        <h2
                          ref={winnerNameRef}
                          className={`winner-name${podiumRevealed ? " landing" : ""}${winnerSettled ? " settled" : ""}`}
                        >
                          {slide.winner.participant}
                        </h2>
                      </div>
                    )}
                    {podiumRevealed && (
                      <div className="podium-section">
                        <div className="podium">
                          <div className="podium-bars">
                            <div className="podium-bar-unit">
                              <span className="podium-bar-name podium-name-silver">
                                <img
                                  src="/crown-silver.svg"
                                  alt=""
                                  className="podium-crown"
                                />{" "}
                                {slide.second.participant}
                              </span>
                              <div className="podium-bar podium-silver">
                                <div className="podium-placement-circle podium-circle-silver">
                                  2
                                </div>
                                <span className="podium-bar-outof">
                                  out of {demoParticipants}
                                </span>
                                <span className="podium-bar-stat">
                                  {demoPodiumPrimaryStat(
                                    activeKey,
                                    slide.second,
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="podium-bar-unit">
                              <span className="podium-bar-name podium-name-gold">
                                <img
                                  src="/crown-gold.svg"
                                  alt=""
                                  className="podium-crown"
                                />
                                <span
                                  ref={podiumFinalNameRef}
                                  className={`podium-final-name${winnerSettled ? " visible" : ""}`}
                                >
                                  {slide.winner.participant}
                                </span>
                              </span>
                              <div className="podium-bar podium-gold">
                                <div className="podium-placement-circle podium-circle-gold">
                                  1
                                </div>
                                <span className="podium-bar-outof">
                                  out of {demoParticipants}
                                </span>
                                <span className="podium-bar-stat">
                                  {demoPodiumPrimaryStat(
                                    activeKey,
                                    slide.winner,
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="podium-bar-unit">
                              <span className="podium-bar-name podium-name-bronze">
                                <img
                                  src="/crown-bronze.svg"
                                  alt=""
                                  className="podium-crown"
                                />{" "}
                                {slide.third.participant}
                              </span>
                              <div className="podium-bar podium-bronze">
                                <div className="podium-placement-circle podium-circle-bronze">
                                  3
                                </div>
                                <span className="podium-bar-outof">
                                  out of {demoParticipants}
                                </span>
                                <span className="podium-bar-stat">
                                  {demoPodiumPrimaryStat(
                                    activeKey,
                                    slide.third,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="podium-detail">
                          {demoRankingDetail(activeKey, slide.winner)}
                        </p>
                        <div className="deck-action-row">
                          <button
                            type="button"
                            ref={expandRef}
                            className="expand-button"
                            tabIndex={-1}
                            onClick={() => setExpanded((v) => !v)}
                          >
                            {expanded
                              ? "Hide full ranking"
                              : `Expand ranking · ${demoParticipants} members`}
                          </button>
                        </div>
                        {(expanded || closing) && (
                          <div
                            className={`ranking-collapse-wrapper${expanded ? " open" : ""}`}
                          >
                            <div className="ranking-collapse-inner">
                              <div className="ranking-panel">
                                <strong>Full ranking</strong>
                                <ol>
                                  {ranking.map((row, index) => (
                                    <li
                                      key={`${activeKey}-${row.participant}-${index}`}
                                    >
                                      <div>
                                        <strong>
                                          {`${index + 1}. ${row.participant}`}
                                        </strong>
                                        <span>
                                          {demoRankingDetail(activeKey, row)}
                                        </span>
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="deck-navigation">
                <div className="deck-dots" aria-label="Superlative slides">
                  {showcaseSlides.map((s, index) => (
                    <button
                      type="button"
                      key={s.key}
                      className={
                        index === slideIndex
                          ? "deck-dot active"
                          : viewedSlides.has(index)
                            ? "deck-dot viewed"
                            : "deck-dot"
                      }
                      tabIndex={-1}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="note">
              A guided tour — each category reveals its winner and podium, plus
              a full ranking. Try your own chat data with the big button above.
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Marquee() {
  const doubled = [...marqueeItems, ...marqueeItems];
  return (
    <div className="landing-marquee" aria-hidden="true">
      <div className="landing-marquee-track">
        {doubled.map((item, i) => (
          <span className="landing-marquee-item" key={`${item.label}-${i}`}>
            <span className="landing-marquee-emoji">{item.emoji}</span>
            <span className="landing-marquee-label">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-section landing-how">
      <motion.div
        className="landing-section-head"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={stagger}
      >
        <motion.span variants={fadeUp} className="landing-kicker">
          HOW IT WORKS
        </motion.span>
        <motion.h2 variants={fadeUp} className="landing-h2">
          From export to epiphany
        </motion.h2>
        <motion.p variants={fadeUp} className="landing-h2-sub">
          Three steps from your Messages app to the podium.
        </motion.p>
      </motion.div>

      <div className="landing-timeline" aria-hidden="true" />

      <motion.div
        className="landing-steps"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.25 }}
        variants={stagger}
      >
        {steps.map((step) => (
          <motion.article
            key={step.title}
            variants={fadeUp}
            className="landing-step"
          >
            <span className="landing-step-chip">{step.num}</span>
            <h3 className="landing-step-title">{step.title}</h3>
            <p className="landing-step-body">{step.body}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function Superlatives() {
  return (
    <section id="superlatives" className="landing-section landing-superlatives">
      <motion.div
        className="landing-section-head"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={stagger}
      >
        <motion.span variants={fadeUp} className="landing-kicker">
          THE SUPERLATIVES
        </motion.span>
        <motion.h2 variants={fadeUp} className="landing-h2">
          Oscar night for your group chat
        </motion.h2>
        <motion.p variants={fadeUp} className="landing-h2-sub">
          Fourteen titles, one conversation. Find your winners.
        </motion.p>
      </motion.div>

      <motion.div
        className="landing-super-cats"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.18 }}
        variants={stagger}
      >
        {superlativeCategories.map((c, i) => (
          <motion.article
            key={c.title}
            variants={fadeUp}
            className="landing-super-cat"
            data-emblem={c.emblem}
            style={
              {
                "--cat-a": c.from,
                "--cat-b": c.to,
              } as CSSProperties
            }
          >
            <span className="landing-super-index">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="landing-super-top">
              <span className="landing-super-medallion">
                <SuperEmblem kind={c.emblem} />
              </span>
              <h3 className="landing-super-cat-title">{c.title}</h3>
            </div>
            <p className="landing-super-cat-blurb">{c.blurb}</p>
            <motion.div
              className="landing-super-cat-items"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.55 }}
              variants={stagger}
            >
              {c.items.map((item) => (
                <motion.span
                  key={item.label}
                  variants={superPop}
                  className="landing-super-chip"
                >
                  <span className="landing-super-emoji">{item.emoji}</span>
                  {item.label}
                </motion.span>
              ))}
            </motion.div>
          </motion.article>
        ))}
      </motion.div>

      <Marquee />
    </section>
  );
}

function CTA() {
  return (
    <section className="landing-cta" aria-label="Get started">
      <motion.div
        className="landing-cta-inner"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={stagger}
      >
        <motion.h2 variants={fadeUp} className="landing-h2">
          Ready to see who really runs the chat?
        </motion.h2>
        <motion.p variants={fadeUp} className="landing-h2-sub">
          It takes one file and about ten seconds.
        </motion.p>
        <motion.div variants={fadeUp} className="landing-cta-actions">
          <MagneticButton
            href="/app"
            className="landing-btn-primary landing-btn-cta"
            target="_blank"
          >
            Try Chat Stats
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </MagneticButton>
          <a
            href="#how-it-works"
            className="landing-btn-ghost landing-btn-ghost--dark"
          >
            Or catch up first
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="landing-foot">
      <div className="landing-foot-col landing-foot-brand-col">
        <Link href="/" className="landing-brand">
          <span className="landing-brand-mark">✦</span>
          CHAT STATS
        </Link>
        <p className="landing-foot-tagline">
          Analysis runs locally. Your conversations stay yours.
        </p>
      </div>
      <div className="landing-foot-col">
        <span className="landing-foot-heading">Product</span>
        <Link
          href="/app"
          className="landing-foot-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Try Chat Stats
        </Link>
        <a href="#superlatives" className="landing-foot-link">
          Superlatives
        </a>
        <a href="#how-it-works" className="landing-foot-link">
          How it works
        </a>
      </div>
      <div className="landing-foot-col">
        <span className="landing-foot-heading">Insights</span>
        <a href="#superlatives" className="landing-foot-link">
          Superlatives
        </a>
        <a href="#demo" className="landing-foot-link">
          The deck
        </a>
      </div>
      <p className="landing-foot-copy">
        © {new Date().getFullYear()} Chat Stats
      </p>
    </footer>
  );
}

type LandingAuth = {
  user: User | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
};

function useLandingAuth(): LandingAuth {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let active = true;
    setLoading(true);
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function signIn() {
    if (!isSupabaseConfigured()) return;
    void createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
  }

  async function signOut() {
    if (isSupabaseConfigured()) {
      await createClient().auth.signOut();
    }
    setUser(null);
  }

  return { user, loading, signIn, signOut };
}

export default function LandingPage() {
  const { scrollRef, progress } = useContainerScroll();
  const auth = useLandingAuth();

  return (
    <div className="landing" ref={scrollRef}>
      <ScrollProgress progress={progress} />
      <Nav progress={progress} auth={auth} />
      <main className="landing-main">
        <Hero />
        <HowItWorks />
        <Showcase containerRef={scrollRef} />
        <Superlatives />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
