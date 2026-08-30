"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  MotionValue,
  animate,
  motion,
  useInView,
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

const features = [
  {
    icon: "crown",
    title: "Unexpected superlatives",
    body: "Who's really the group's main character? We measure reactions, not noise, to hand out titles worth arguing about.",
    from: "#f6c56a",
    to: "#c9822e",
  },
  {
    icon: "bolt",
    title: "Replies & reaction timing",
    body: "Median reply times, quick-draw responders, how long the group takes to go quiet, and who breaks the silence.",
    from: "#8fd3f7",
    to: "#3b82c4",
  },
  {
    icon: "moon",
    title: "Activity patterns",
    body: "Night owls, early birds, and conversation starters. See who's texting at 3 a.m. and who starts every thread.",
    from: "#b7a6f5",
    to: "#6d5ad6",
  },
  {
    icon: "pen",
    title: "Language & vocabulary",
    body: "Longest messages, largest unique vocabularies, and the wordsmiths whose phrases the whole group picks up.",
    from: "#ffd0e6",
    to: "#e2709f",
  },
  {
    icon: "shield",
    title: "Grammar & style",
    body: "Grammar police and punctuation perfectionists identified automatically, right down to the sentence level.",
    from: "#9fe8c8",
    to: "#3aa97c",
  },
  {
    icon: "film",
    title: "Cinematic reveals",
    body: "Superlatives come alive in an animated, tab-friendly deck with dramatic reveals and a final podium.",
    from: "#8fd3f7",
    to: "#155a8e",
  },
];

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

const stats = [
  { value: 14, decimals: 0, suffix: "", label: "Superlative titles" },
  { value: 100, decimals: 0, suffix: "%", label: "Analysis runs locally" },
  { value: 3, decimals: 0, suffix: "", label: "Chat formats supported" },
  { value: 600, decimals: 0, suffix: "+", label: "IANA timezones" },
];

const navLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
];

function FeatureIcon({ name }: { name: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "crown":
      return (
        <svg {...common}>
          <path d="M3 17l2-9 5 3.5L12 5l2 6.5L19 8l2 9z" />
          <path d="M3 20h18" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <polygon points="13 2 4 14 11 14 10 22 20 10 12 10 13 2" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
          <path d="m9 12 2 2 4-4.5" />
        </svg>
      );
    case "film":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 5v14M17 5v14M3 10h4M3 15h4M17 10h4M17 15h4" />
        </svg>
      );
    default:
      return null;
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

function Counter({
  value,
  decimals,
  suffix,
}: {
  value: number;
  decimals: number;
  suffix: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.8,
      ease: EASE,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("en-US");

  return (
    <div ref={ref} className="landing-stat-value">
      {formatted}
      {suffix}
    </div>
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

function Hero() {
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    const target = "Find out who really runs the group chat.";
    let i = 0;
    setTypedText("");
    const interval = setInterval(() => {
      i += 1;
      setTypedText(target.slice(0, i));
      if (i >= target.length) clearInterval(interval);
    }, 55);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="landing-hero" aria-label="Intro">
      <div className="landing-blob landing-blob--1" aria-hidden="true" />
      <div className="landing-blob landing-blob--2" aria-hidden="true" />
      <div className="landing-blob landing-blob--3" aria-hidden="true" />
      <div className="landing-dots" aria-hidden="true" />

      <motion.div
        className="landing-hero-inner"
        initial="hidden"
        animate="show"
        variants={stagger}
      >
        <motion.p variants={fadeUp} className="landing-eyebrow">
          <span className="landing-eyebrow-dot" aria-hidden="true" />
          GROUP CHAT ANALYTICS · iMESSAGE INSIGHTS
        </motion.p>
        <motion.h1 variants={fadeUp} className="landing-h1">
          {typedText}
          <span className="cursor" aria-hidden="true">
            |
          </span>
        </motion.h1>
        <motion.p variants={fadeUp} className="landing-sub">
          Upload an iMessage export and find unexpected superlatives.
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
      </motion.div>

      <motion.div
        className="landing-scroll-cue"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
        aria-hidden="true"
      >
        <span className="landing-scroll-mouse">
          <span className="landing-scroll-wheel" />
        </span>
        <span>Scroll</span>
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
    }, 1100);
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
      const section = ref.current;
      const cRect = container.getBoundingClientRect();
      const sRect = section ? section.getBoundingClientRect() : null;
      const start = sRect
        ? sRect.top - cRect.top + container.scrollTop - 90
        : 0;
      const end = sRect && section ? start + section.offsetHeight : 0;
      const current = container.scrollTop;
      const inSection = current >= start && current <= end;
      if (expanded) {
        restoreScrollRef.current = container.scrollTop;
        const el = expandRef.current;
        if (el && inSection) {
          const top =
            el.getBoundingClientRect().top +
            container.scrollTop -
            (reduce ? 90 : 140);
          container.scrollTo({ top: Math.max(0, top), behavior });
        }
      } else if (restoreScrollRef.current != null) {
        if (inSection) {
          container.scrollTo({
            top: restoreScrollRef.current,
            behavior,
          });
        }
        restoreScrollRef.current = null;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [expanded, containerRef]);

  useEffect(() => {
    let stopped = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function until(test: () => boolean) {
      const start = Date.now();
      while (!test() && !stopped) {
        if (Date.now() - start > 7000) return;
        await sleep(40);
      }
    }

    async function press(action: () => void) {
      action();
      await sleep(150);
    }

    (async () => {
      await sleep(1400);
      while (!stopped) {
        await until(() => Boolean(suspenseRef.current));
        await press(() => setWinnerRevealed(true));

        await until(() => Boolean(spotlightRef.current));
        await sleep(1300);
        await press(() => setPodiumRevealed(true));

        await sleep(1700);
        const idx = slideIndexRef.current;

        if (idx === 1) {
          await until(() => Boolean(expandRef.current));
          await press(() => {
            setClosing(false);
            setExpanded(true);
          });
          await sleep(2000);
          await press(closeRankingRef.current);
          await sleep(1500);
        }

        if (idx === 2) {
          await sleep(500);
          await press(() => goToSlide(1, "left"));
          await until(() => Boolean(suspenseRef.current));
          await sleep(1300);
          await press(() => goToSlide(2, "right"));
          await until(() => Boolean(suspenseRef.current));
          await sleep(1300);
        }

        await press(() => goToSlide(slideIndexRef.current + 1, "right"));
        await until(() => Boolean(suspenseRef.current));
        await sleep(1800);
      }
    })();

    return () => {
      stopped = true;
    };
  }, []);

  const ranking = expanded || closing ? demoFullRanking(activeKey) : [];

  return (
    <section
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
        <div className="showcase-glow" aria-hidden="true" />
      </motion.div>
    </section>
  );
}

function StatsBand() {
  return (
    <section className="landing-stats" aria-label="Highlights">
      <motion.div
        className="landing-stats-inner"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={stagger}
      >
        {stats.map((stat) => (
          <motion.div
            variants={fadeUp}
            className="landing-stat"
            key={stat.label}
          >
            <Counter
              value={stat.value}
              decimals={stat.decimals}
              suffix={stat.suffix}
            />
            <span className="landing-stat-label">{stat.label}</span>
          </motion.div>
        ))}
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

function Features() {
  return (
    <section id="features" className="landing-section landing-features">
      <motion.div
        className="landing-section-head"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={stagger}
      >
        <motion.span variants={fadeUp} className="landing-kicker">
          FEATURES
        </motion.span>
        <motion.h2 variants={fadeUp} className="landing-h2">
          What you&apos;ll find out
        </motion.h2>
        <motion.p variants={fadeUp} className="landing-h2-sub">
          Every metric is computed from your actual messages.
        </motion.p>
      </motion.div>

      <motion.div
        className="landing-feature-grid"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        variants={stagger}
      >
        {features.map((f) => (
          <motion.article
            key={f.title}
            variants={fadeUp}
            className="landing-feature"
          >
            <span
              className="landing-feature-icon"
              style={{
                background: `linear-gradient(135deg, ${f.from}, ${f.to})`,
                color: "#ffffff",
              }}
            >
              <FeatureIcon name={f.icon} />
            </span>
            <h3 className="landing-feature-title">{f.title}</h3>
            <p className="landing-feature-body">{f.body}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function CTA() {
  return (
    <section className="landing-cta" aria-label="Get started">
      <div className="landing-cta-glow" aria-hidden="true" />
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
        <a href="#features" className="landing-foot-link">
          Features
        </a>
        <a href="#how-it-works" className="landing-foot-link">
          How it works
        </a>
      </div>
      <div className="landing-foot-col">
        <span className="landing-foot-heading">Insights</span>
        <a href="#how-it-works" className="landing-foot-link">
          Superlatives
        </a>
        <a href="#features" className="landing-foot-link">
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
        <Showcase containerRef={scrollRef} />
        <StatsBand />
        <Marquee />
        <HowItWorks />
        <Features />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
