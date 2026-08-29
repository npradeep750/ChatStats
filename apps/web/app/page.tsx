"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  createClient,
  getProfileFromSupabase,
  isSupabaseConfigured,
  removeAvatarFromSupabase,
  saveProfileToSupabase,
  uploadAvatarToSupabase,
} from "../lib/supabase/client";

type Ranking = {
  participant: string;
  participant_id?: string;
  score?: number;
  ranking_score?: number;
  average_message_impact?: number;
  average_reactions?: number;
  total_reactions?: number;
  reacted_messages?: number;
  reaction_types?: Record<string, number>;
  reaction_rate?: number;
  reply_rate?: number;
  eligible_messages?: number;
  confidence?: string;
  rate?: number;
  max_run?: number;
  average_words?: number;
  longest_message?: string | null;
  longest_message_words?: number;
  per_100_messages?: number;
  total_emojis?: number;
  total_media_items?: number;
  starts_per_100_messages?: number;
  message_count?: number;
  median_reply_seconds?: number | null;
  reply_count?: number;
  long_gap_starts?: number;
  share?: number;
  messages?: number;
  top_emojis?: unknown[];
  media?: Record<string, number>;
  message_share?: number;
  active_days?: number;
  late_reply_count?: number;
  average_late_hours?: number;
  longest_late_hours?: number;
  intervening_messages?: number;
  explicit_late_replies?: number;
  grammar_score?: number;
  proper_punctuation_rate?: number;
  capitalization_rate?: number;
  formal_marker_rate?: number;
  grammar_messages?: number;
  minimum_sample?: number;
  silence_gaps?: number;
  silence_trigger_rate?: number;
  total_silence_hours?: number;
  longest_silence_hours?: number;
  spread?: number;
  total_uses?: number;
  unique_words?: number;
  total_words?: number;
  first_use_terms?: number;
  mention_count?: number;
  total_mentions?: number;
  unmapped_mentions?: number;
};
type ReportParticipant = { participant_id: string; display_name: string };
type Report = {
  report_metadata: { source_format: string; timezone: string };
  conversation_summary: {
    title: string;
    message_count: number;
    participant_count: number;
  };
  participants?: ReportParticipant[];
  titles: Record<string, Ranking | null>;
  leaderboards?: Record<string, unknown>;
  warnings: string[];
};
type SavedReport = {
  id: string;
  title: string;
  source_format: string;
  message_count: number;
  participant_count: number;
  created_at: string;
  report: Report;
};
type ConversationOption = {
  conversation_id: string;
  title: string;
  is_named?: boolean;
  participant_names?: string[];
  message_count: number;
  participant_count: number;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const LOCAL_KEY = "chat-analytics-saved-reports";
const USERNAME_LOCAL_KEY = "chat-stats-username";
const AVATAR_LOCAL_KEY = "chat-stats-avatar";
const DECK_STATE_KEY = "chat-stats-deck-state";
const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Pacific Time — Los Angeles" },
  { value: "America/Denver", label: "Mountain Time — Denver" },
  { value: "America/Chicago", label: "Central Time — Chicago" },
  { value: "America/New_York", label: "Eastern Time — New York" },
  { value: "America/Sao_Paulo", label: "Brasilia Time — São Paulo" },
  { value: "Europe/London", label: "United Kingdom — London" },
  { value: "Europe/Paris", label: "Central European Time — Paris" },
  { value: "Asia/Dubai", label: "Gulf Time — Dubai" },
  { value: "Asia/Kolkata", label: "India Standard Time — Kolkata" },
  { value: "Asia/Singapore", label: "Singapore Time" },
  { value: "Asia/Tokyo", label: "Japan Standard Time — Tokyo" },
  { value: "Australia/Sydney", label: "Australian Eastern Time — Sydney" },
];

function unavailableUploadFormat(file: File | null) {
  if (!file) return null;
  if (/\.json$/i.test(file.name)) return "Instagram JSON";
  if (/\.csv$/i.test(file.name)) return "CSV";
  return null;
}
const titleLabels: Record<string, string> = {
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

function readLocalReports(): SavedReport[] {
  try {
    return JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "[]",
    ) as SavedReport[];
  } catch {
    return [];
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readChatIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("chat");
}

function chatUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("chat", id);
  else url.searchParams.delete("chat");
  return url.toString();
}

function pushChatIdInUrl(id: string | null) {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", chatUrl(id));
}

function replaceChatIdInUrl(id: string | null) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", chatUrl(id));
}

function looksLikeIdentifier(value: string) {
  const trimmed = value.trim();
  return (
    /^\+?[\d\s().-]{7,}$/.test(trimmed) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  );
}

function storedParticipantNames(nextReport: Report) {
  return Object.fromEntries(
    (nextReport.participants ?? [])
      .filter(
        (person) =>
          person.display_name.trim() &&
          person.display_name !== "Me" &&
          !looksLikeIdentifier(person.display_name),
      )
      .map((person) => [person.participant_id, person.display_name]),
  );
}

function withParticipantNames(
  nextReport: Report,
  names: Record<string, string>,
): Report {
  function rename(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rename);
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    const result = Object.fromEntries(
      Object.entries(source).map(([key, child]) => [key, rename(child)]),
    );
    const participantId =
      typeof source.participant_id === "string" ? source.participant_id : "";
    const replacement = participantId ? names[participantId]?.trim() : "";
    if (replacement && "participant" in source)
      result.participant = replacement;
    if (participantId && "display_name" in source && replacement)
      result.display_name = replacement;
    return result;
  }
  return rename(nextReport) as Report;
}

function compactReportForSave(nextReport: Report): Report {
  const leaderboards = nextReport.leaderboards ?? {};
  const mainCharacter = leaderboards.main_character;
  const compactMainCharacter =
    mainCharacter &&
    typeof mainCharacter === "object" &&
    !Array.isArray(mainCharacter)
      ? Object.fromEntries(
          Object.entries(mainCharacter as Record<string, unknown>).filter(
            ([key]) => key !== "message_evidence",
          ),
        )
      : mainCharacter;
  return {
    ...nextReport,
    leaderboards: { ...leaderboards, main_character: compactMainCharacter },
  };
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function stripInvisibles(value: string): string {
  return value.replace(
    /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g,
    "",
  );
}

function phoneVariants(value: string): string[] {
  const digits = normalizePhoneNumber(value);
  const variants = [digits];
  if (digits.length === 11 && digits.startsWith("1"))
    variants.push(digits.slice(1));
  else if (digits.length === 10) variants.push("1" + digits);
  return variants;
}

function contactKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    ? trimmed
    : normalizePhoneNumber(value);
}

function parseVcf(text: string): Map<string, string> {
  const unfolded = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  const map = new Map<string, string>();
  const cards = unfolded.split(/^BEGIN:VCARD\s*$/im).slice(1);
  for (const rawCard of cards) {
    const card = rawCard.split(/^END:VCARD\s*$/im)[0] ?? "";
    let fullName = "";
    const nParts = card.match(/^(?:[A-Za-z0-9-]+\.)?N[^:]*:(.*)$/im)?.[1];
    if (nParts) {
      const [family, given, ...rest] = nParts.split(";");
      fullName = [given, family, ...rest]
        .map((part) => part?.trim())
        .filter((part) => part && part !== "")
        .join(" ")
        .trim();
    }
    const fnValue = card
      .match(/^(?:[A-Za-z0-9-]+\.)?FN[^:]*:(.*)$/im)?.[1]
      ?.trim();
    if (fnValue && fnValue !== " " && fullName.indexOf(fnValue) === -1) {
      fullName = fnValue;
    }
    if (!fullName) continue;
    const telMatches = card.matchAll(/^(?:[A-Za-z0-9-]+\.)?TEL[^:]*:(.*)$/gim);
    const emailMatches = card.matchAll(
      /^(?:[A-Za-z0-9-]+\.)?EMAIL[^:]*:(.*)$/gim,
    );
    for (const match of telMatches)
      for (const variant of phoneVariants(match[1]))
        putContact(map, variant, fullName);
    for (const match of emailMatches)
      putContact(map, contactKey(match[1]), fullName);
  }
  return map;
}

function putContact(map: Map<string, string>, key: string, name: string): void {
  if (!key) return;
  if (!map.has(key)) map.set(key, name);
}

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === "Me" ||
    looksLikeIdentifier(trimmed) ||
    !trimmed.includes(" ")
  )
    return trimmed;
  return trimmed.split(/\s+/)[0];
}

function meParticipantIdFrom(report: Report): string | null {
  const me = (report.participants ?? []).find(
    (person) => person.display_name === "Me",
  );
  return me?.participant_id ?? null;
}

const superlativeDescriptions: Record<string, string> = {
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

const leaderboardNames: Record<string, string> = {
  main_character: "main_character",
};

function useAnimatedCount(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function leaderboardRows(nextReport: Report, key: string): Ranking[] {
  const source = nextReport.leaderboards?.[leaderboardNames[key] ?? key];
  const rawRows =
    key === "main_character" &&
    source &&
    typeof source === "object" &&
    !Array.isArray(source)
      ? (source as { rankings?: unknown }).rankings
      : source;
  if (!Array.isArray(rawRows)) return [];
  const rows = rawRows.filter((row): row is Ranking =>
    Boolean(
      row &&
      typeof row === "object" &&
      typeof (row as Ranking).participant === "string",
    ),
  );
  const sortedRows = rows.sort((left, right) => {
    if (key === "quick_draw")
      return (
        (left.median_reply_seconds ?? Number.POSITIVE_INFINITY) -
        (right.median_reply_seconds ?? Number.POSITIVE_INFINITY)
      );
    if (key === "ghost")
      return (left.message_count ?? 0) - (right.message_count ?? 0);
    const field =
      key === "double_texter"
        ? "rate"
        : key === "novelist"
          ? "average_words"
          : key === "conversation_starter"
            ? "ranking_score"
            : ["night_owl", "early_bird"].includes(key)
              ? "share"
              : key === "main_character"
                ? "ranking_score"
                : ["emoji_addict", "media_spammer", "time_traveler"].includes(
                      key,
                    )
                  ? "ranking_score"
                  : key === "grammar_police"
                    ? "grammar_score"
                    : key === "wordsmith"
                      ? "unique_words"
                      : key === "trendsetter"
                        ? "first_use_terms"
                        : "per_100_messages";
    return (
      Number((right as Record<string, unknown>)[field] ?? 0) -
      Number((left as Record<string, unknown>)[field] ?? 0)
    );
  });
  return sortedRows;
}

function emojiSummary(row: Ranking) {
  if (!Array.isArray(row.top_emojis) || row.top_emojis.length === 0)
    return "no emoji breakdown";
  return row.top_emojis
    .slice(0, 3)
    .map((item) => (Array.isArray(item) ? `${item[0]} ×${item[1]}` : ""))
    .filter(Boolean)
    .join(" ");
}

function mediaSummary(row: Ranking) {
  if (!row.media || Object.keys(row.media).length === 0)
    return "no media or links";
  return Object.entries(row.media)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
}

function reactionTypeSummary(row: Ranking) {
  if (!row.reaction_types || Object.keys(row.reaction_types).length === 0)
    return "no reactions detected";
  return Object.entries(row.reaction_types)
    .map(([emoji, count]) => `${emoji} ×${count}`)
    .join(" ");
}

function rankingDetail(key: string, row: Ranking) {
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
}

function podiumPrimaryStat(key: string, row: Ranking): string {
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

function podiumPlacement(index: number, total: number): string {
  const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
  return `${ordinals[index] ?? `${index + 1}th`} of ${total}`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [contactsMap, setContactsMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [timezone, setTimezone] = useState("UTC");
  const [report, setReport] = useState<Report | null>(null);
  const [conversationChoices, setConversationChoices] = useState<
    ConversationOption[]
  >([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSearchActive, setConversationSearchActive] =
    useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>(() =>
    typeof window === "undefined" ? [] : readLocalReports(),
  );
  const [reportsLoaded, setReportsLoaded] = useState(
    typeof window === "undefined" ? false : !isSupabaseConfigured(),
  );
  const lastOpenedChatRef = useRef<string | null>(null);
  const winnerNameRef = useRef<HTMLHeadingElement>(null);
  const podiumCrownRef = useRef<HTMLImageElement>(null);
  const podiumFinalNameRef = useRef<HTMLSpanElement>(null);
  const lastSlideKeyRef = useRef<string | null>(null);
  const deckRestoreDoneRef = useRef(false);
  const [winnerSettled, setWinnerSettled] = useState(false);
  const [activeSavedReportId, setActiveSavedReportId] = useState<string | null>(
    null,
  );
  const [homeView, setHomeView] = useState(true);
  const [hasUrlChat, setHasUrlChat] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [participantNames, setParticipantNames] = useState<
    Record<string, string>
  >({});
  const [username, setUsername] = useState<string>("");
  const [usernameDraft, setUsernameDraft] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarDraft, setAvatarDraft] = useState<File | null>(null);
  const [removeAvatarFlag, setRemoveAvatarFlag] = useState(false);
  const [expandedSuperlative, setExpandedSuperlative] = useState<string | null>(
    null,
  );
  const [slideIndex, setSlideIndex] = useState(0);
  const [winnerRevealed, setWinnerRevealed] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right",
  );

  const [autoPlay, setAutoPlay] = useState(false);
  const [viewedSlides, setViewedSlides] = useState<Set<number>>(new Set([0]));
  const [podiumRevealed, setPodiumRevealed] = useState(false);
  const [visibilityTick, setVisibilityTick] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [typedText, setTypedText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");

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

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSavedReports(readLocalReports());
      setReportsLoaded(true);
      return;
    }
    const supabase = createClient();
    let active = true;
    async function loadReports() {
      const { data } = await supabase
        .from("chat_reports")
        .select(
          "id,title,source_format,message_count,participant_count,created_at,report",
        )
        .order("created_at", { ascending: false });
      if (active && data) setSavedReports(data as SavedReport[]);
      if (active) setReportsLoaded(true);
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      if (data.user) void loadReports();
      else {
        setSavedReports(readLocalReports());
        setReportsLoaded(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) void loadReports();
        else {
          setSavedReports(readLocalReports());
          setReportsLoaded(true);
        }
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let stored = "";
    let storedAvatar = "";
    try {
      stored = window.localStorage.getItem(USERNAME_LOCAL_KEY) ?? "";
      storedAvatar = window.localStorage.getItem(AVATAR_LOCAL_KEY) ?? "";
    } catch {
      stored = "";
      storedAvatar = "";
    }
    if (stored) {
      setUsername(stored);
      setUsernameDraft(stored);
    }
    if (storedAvatar) setAvatarUrl(storedAvatar);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isSupabaseConfigured()) return;
    let active = true;
    void getProfileFromSupabase().then((profile) => {
      if (!active) return;
      if (profile.username) {
        setUsername(profile.username);
        setUsernameDraft(profile.username);
        try {
          window.localStorage.setItem(USERNAME_LOCAL_KEY, profile.username);
        } catch {
          /* ignore */
        }
      }
      if (profile.avatar_url) {
        setAvatarUrl(profile.avatar_url);
        try {
          window.localStorage.setItem(AVATAR_LOCAL_KEY, profile.avatar_url);
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      active = false;
    };
  }, [user]);

  function openChatById(id: string | null) {
    if (!id) {
      setHomeView(true);
      setActiveSavedReportId(null);
      setReport(null);
      setParticipantNames({});
      return;
    }
    const item = savedReports.find((s) => s.id === id);
    if (!item) return;
    const sameChat = lastOpenedChatRef.current === id;
    lastOpenedChatRef.current = id;
    setReport(item.report);
    if (!sameChat) setParticipantNames(storedParticipantNames(item.report));
    if (!sameChat) {
      setExpandedSuperlative(null);
      setSlideIndex(0);
      setWinnerRevealed(false);
      setPodiumRevealed(false);
      setWinnerSettled(false);
      setAutoPlay(false);
      setViewedSlides(new Set([0]));
    }
    setActiveSavedReportId(item.id);
    setHomeView(false);
  }

  useEffect(() => {
    setHasUrlChat(readChatIdFromUrl() != null);
  }, []);

  useEffect(() => {
    const chatId = readChatIdFromUrl();
    if (!chatId) return;
    if (!reportsLoaded) return;
    if (!savedReports.some((s) => s.id === chatId)) {
      replaceChatIdInUrl(null);
      openChatById(null);
      return;
    }
    openChatById(chatId);
  }, [savedReports, reportsLoaded]);

  useEffect(() => {
    const onPop = () => {
      const chatId = readChatIdFromUrl();
      if (!chatId) {
        setHomeView(true);
        setActiveSavedReportId(null);
        setReport(null);
        setParticipantNames({});
        return;
      }
      if (!savedReports.some((s) => s.id === chatId)) {
        window.history.back();
        return;
      }
      openChatById(chatId);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [savedReports]);

  useEffect(() => {
    if (!settingsOpen && !profileOpen && !searchOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setProfileOpen(false);
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, profileOpen, searchOpen]);

  async function signInWithGoogle() {
    if (!isSupabaseConfigured()) {
      setError(
        "Add the Supabase environment variables before enabling Google sign-in.",
      );
      return;
    }
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) setError(authError.message);
  }

  async function signOut() {
    if (!isSupabaseConfigured()) return;
    await createClient().auth.signOut();
    setUser(null);
    setSavedReports(readLocalReports());
    setReport(null);
    setActiveSavedReportId(null);
    setParticipantNames({});
    replaceChatIdInUrl(null);
    setHomeView(true);
  }

  async function handleSaveProfile() {
    const nextUsername = usernameDraft.trim();
    setError("");
    if (!user) {
      setError("Sign in to save your profile.");
      return;
    }
    let nextAvatarUrl = avatarUrl;
    try {
      if (avatarDraft) {
        if (!avatarDraft.type.startsWith("image/")) {
          setError("Profile picture must be an image (JPG, PNG, etc.).");
          return;
        }
        if (avatarDraft.size > 5 * 1024 * 1024) {
          setError("Profile picture must be 5 MB or smaller.");
          return;
        }
        const uploaded = await uploadAvatarToSupabase(avatarDraft);
        if (!uploaded) {
          setError("Could not upload your profile picture.");
          return;
        }
        if (avatarUrl) await removeAvatarFromSupabase(avatarUrl);
        nextAvatarUrl = uploaded;
        setAvatarDraft(null);
        setRemoveAvatarFlag(false);
      } else if (removeAvatarFlag && avatarUrl) {
        await removeAvatarFromSupabase(avatarUrl);
        nextAvatarUrl = "";
        setRemoveAvatarFlag(false);
      }
      await saveProfileToSupabase({
        username: nextUsername,
        avatar_url: nextAvatarUrl,
      });
      setUsername(nextUsername);
      setAvatarUrl(nextAvatarUrl);
      try {
        window.localStorage.setItem(USERNAME_LOCAL_KEY, nextUsername);
        window.localStorage.setItem(AVATAR_LOCAL_KEY, nextAvatarUrl);
      } catch {
        /* ignore */
      }
    } catch {
      setError("Could not save your profile. Please try again.");
    }
  }

  function openProfile() {
    setAccountMenuOpen(false);
    setUsernameDraft(username);
    setAvatarDraft(null);
    setRemoveAvatarFlag(false);
    setProfileOpen(true);
  }

  async function saveReport(nextReport: Report) {
    const persistedReport = compactReportForSave(nextReport);
    const entry: SavedReport = {
      id: crypto.randomUUID(),
      title:
        persistedReport.conversation_summary.title || "Untitled group chat",
      source_format: persistedReport.report_metadata.source_format,
      message_count: persistedReport.conversation_summary.message_count,
      participant_count: persistedReport.conversation_summary.participant_count,
      created_at: new Date().toISOString(),
      report: persistedReport,
    };
    if (user && isSupabaseConfigured()) {
      const { data, error: saveError } = await createClient()
        .from("chat_reports")
        .insert({
          user_id: user.id,
          title: entry.title,
          source_format: entry.source_format,
          message_count: entry.message_count,
          participant_count: entry.participant_count,
          report: entry.report,
        })
        .select(
          "id,title,source_format,message_count,participant_count,created_at",
        )
        .single();
      if (saveError) {
        setError(
          `Chat analyzed, but it could not be saved: ${saveError.message}`,
        );
        return null;
      }
      if (data)
        setSavedReports((current) => [
          { ...(data as Omit<SavedReport, "report">), report: persistedReport },
          ...current,
        ]);
      return data?.id ?? null;
    }
    const next = [entry, ...readLocalReports()].slice(0, 20);
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setSavedReports(next);
    return entry.id;
  }

  async function updateSavedReport(nextReport: Report) {
    if (!activeSavedReportId) return;
    const persistedReport = compactReportForSave(nextReport);
    const title =
      persistedReport.conversation_summary.title || "Untitled group chat";
    if (user && isSupabaseConfigured()) {
      const { data, error: updateError } = await createClient()
        .from("chat_reports")
        .update({ title, report: persistedReport })
        .eq("id", activeSavedReportId)
        .select(
          "id,title,source_format,message_count,participant_count,created_at",
        )
        .single();
      if (updateError) {
        setError(
          `Names were applied, but the saved report could not be updated: ${updateError.message}`,
        );
        return;
      }
      if (data)
        setSavedReports((current) =>
          current.map((item) =>
            item.id === activeSavedReportId
              ? {
                  ...(data as Omit<SavedReport, "report">),
                  report: persistedReport,
                }
              : item,
          ),
        );
      return;
    }
    const next = savedReports.map((item) =>
      item.id === activeSavedReportId
        ? { ...item, title, report: persistedReport }
        : item,
    );
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setSavedReports(next);
  }

  async function applyParticipantNames() {
    if (!report) return;
    const cleanedNames = Object.fromEntries(
      Object.entries(participantNames)
        .map(([id, name]) => [id, name.trim()])
        .filter(([, name]) => Boolean(name)),
    );
    setParticipantNames(cleanedNames);
    await updateSavedReport(withParticipantNames(report, cleanedNames));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const unavailableFormat = unavailableUploadFormat(file);
    if (!file || unavailableFormat) return;
    setBusy(true);
    setError("");
    setProgress(5);
    setProgressStage("Uploading file");
    const form = new FormData();
    form.append("file", file);
    form.append("timezone", timezone);
    try {
      const isSQLite = /\.(sqlite|sqlite3|db)$/i.test(file.name);
      if (isSQLite && !selectedConversationId) {
        setProgress(15);
        setProgressStage(
          "Indexing conversations — large files may take a moment",
        );
        const previewResponse = await fetch(`${API}/v1/imports/preview`, {
          method: "POST",
          body: form,
        });
        const previewBody = await previewResponse.json();
        if (!previewResponse.ok)
          throw new Error(
            previewBody.detail ?? "Could not inspect the SQLite file",
          );
        const choices = previewBody.conversations as ConversationOption[];
        setConversationChoices(choices);
        setConversationSearchActive(false);
        if (choices.length === 1)
          setSelectedConversationId(choices[0].conversation_id);
        return;
      }
      if (selectedConversationId)
        form.append("conversation_id", selectedConversationId);
      const response = await fetch(`${API}/v1/imports/start`, {
        method: "POST",
        body: form,
      });
      const job = await response.json();
      if (!response.ok)
        throw new Error(job.detail ?? "Could not start analysis");
      let finished = false;
      while (!finished) {
        const jobResponse = await fetch(`${API}/v1/imports/jobs/${job.job_id}`);
        const current = await jobResponse.json();
        if (!jobResponse.ok)
          throw new Error(current.detail ?? "Could not read analysis progress");
        setProgress(current.progress ?? 0);
        setProgressStage(current.stage ?? "Analyzing");
        if (current.status === "failed")
          throw new Error(current.error ?? "Analysis failed");
        if (current.status === "complete") {
          const matchedNames: Record<string, string> = {};
          let unmatched = 0;
          if (contactsMap.size > 0) {
            for (const person of current.report.participants ?? []) {
              if (person.display_name === "Me") continue;
              const raw = stripInvisibles(person.display_name);
              const isIdentifier =
                looksLikeIdentifier(raw) ||
                (raw.trim().length > 0 && /\d/.test(raw) && !raw.includes(" "));
              if (!isIdentifier) continue;
              const name = contactsMap.get(contactKey(raw));
              if (name) matchedNames[person.participant_id] = name;
              else unmatched += 1;
            }
          }
          setUnmatchedCount(unmatched);
          setReport(current.report);
          setParticipantNames(matchedNames);
          setExpandedSuperlative(null);
          setSlideIndex(0);
          setWinnerRevealed(false);
          setPodiumRevealed(false);
          setWinnerSettled(false);
          setAutoPlay(false);
          setViewedSlides(new Set([0]));
          const namedReport =
            Object.keys(matchedNames).length > 0
              ? withParticipantNames(current.report, matchedNames)
              : current.report;
          const savedId = await saveReport(namedReport);
          setActiveSavedReportId(savedId);
          replaceChatIdInUrl(savedId);
          setHomeView(false);
          finished = true;
        } else await new Promise((resolve) => window.setTimeout(resolve, 450));
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not process file",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeReport(id: string) {
    if (user && isSupabaseConfigured())
      await createClient().from("chat_reports").delete().eq("id", id);
    const next = savedReports.filter((item) => item.id !== id);
    setSavedReports(next);
    if (!user) window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    if (activeSavedReportId === id) {
      setActiveSavedReportId(null);
      setReport(null);
      setParticipantNames({});
      replaceChatIdInUrl(null);
      setHomeView(true);
    }
  }

  function onFileChange(nextFile: File | null) {
    setFile(nextFile);
    setContactsFile(null);
    setContactsMap(new Map());
    setUnmatchedCount(0);
    setConversationChoices([]);
    setSelectedConversationId("");
    setConversationSearch("");
    setConversationSearchActive(false);
    setReport(null);
    setActiveSavedReportId(null);
    setParticipantNames({});
    setExpandedSuperlative(null);
    setSlideIndex(0);
    setWinnerRevealed(false);
    setPodiumRevealed(false);
    setWinnerSettled(false);
    setError("");
    replaceChatIdInUrl(null);
  }

  async function onContactsFileChange(nextFile: File | null) {
    setContactsFile(nextFile);
    setUnmatchedCount(0);
    if (!nextFile) {
      setContactsMap(new Map());
      return;
    }
    try {
      const text = await nextFile.text();
      const parsed = parseVcf(text);
      setContactsMap(parsed);
      setError("");
    } catch {
      setContactsMap(new Map());
      setError("Could not read the contacts file. Choose a .vcf export.");
    }
  }

  const analyzedTitles = new Set(
    savedReports.map((r) => r.title.toLowerCase()),
  );
  const visibleChoices = conversationChoices.filter((choice) =>
    choice.title
      .toLowerCase()
      .includes(conversationSearch.toLowerCase().trim()),
  );
  const analyzedChoiceIds = new Set(
    visibleChoices
      .filter((c) => analyzedTitles.has(c.title.toLowerCase()))
      .map((c) => c.conversation_id),
  );
  const selectedIsAnalyzed =
    selectedConversationId !== "" &&
    analyzedChoiceIds.has(selectedConversationId);

  const meId = report ? meParticipantIdFrom(report) : null;
  const searchQueryLower = searchQuery.trim().toLowerCase();
  const filteredReports = savedReports.filter((item) =>
    item.title.toLowerCase().includes(searchQueryLower),
  );
  const displayedNames = Object.fromEntries(
    (report?.participants ?? []).map((person) => {
      const override = participantNames[person.participant_id]?.trim();
      const isMe = person.participant_id === meId;
      const source =
        override ||
        (isMe && username.trim() ? username.trim() : "") ||
        person.display_name ||
        person.participant_id;
      return [person.participant_id, firstNameOf(source)];
    }),
  );

  const displayedReport = report
    ? withParticipantNames(report, displayedNames)
    : null;
  const loadingReport = hasUrlChat && !reportsLoaded && !report && homeView;
  const unavailableFormat = unavailableUploadFormat(file);
  const reportParticipants = report?.participants ?? [];
  const participantsToName = reportParticipants;
  const availableSuperlatives = displayedReport
    ? Object.entries(displayedReport.titles).filter(
        ([key, winner]) =>
          winner &&
          (key !== "media_spammer" || (winner.per_100_messages ?? 0) > 0),
      )
    : [];
  const activeSlideIndex = Math.min(
    slideIndex,
    Math.max(0, availableSuperlatives.length - 1),
  );
  const activeSlide = availableSuperlatives[activeSlideIndex];
  const activeWinner = activeSlide?.[1] ?? null;
  const podiumRows = displayedReport
    ? leaderboardRows(displayedReport, activeSlide[0])
    : [];
  const podium2nd = podiumRows[1] ?? null;
  const podium3rd = podiumRows[2] ?? null;
  const mainCharacterLeaderboard =
    displayedReport?.leaderboards?.main_character;
  const totalReactions =
    mainCharacterLeaderboard &&
    typeof mainCharacterLeaderboard === "object" &&
    !Array.isArray(mainCharacterLeaderboard) &&
    typeof (mainCharacterLeaderboard as { total_reactions?: unknown })
      .total_reactions === "number"
      ? (mainCharacterLeaderboard as { total_reactions: number })
          .total_reactions
      : leaderboardRows(
          displayedReport ?? ({} as Report),
          "main_character",
        ).reduce((total, row) => total + (row.total_reactions ?? 0), 0);

  const animMessages = useAnimatedCount(
    displayedReport?.conversation_summary.message_count ?? 0,
  );
  const animParticipants = useAnimatedCount(
    displayedReport?.conversation_summary.participant_count ?? 0,
  );
  const animReactions = useAnimatedCount(totalReactions);

  const advanceToNextSlide = () => {
    setSlideDirection("right");
    setSlideIndex((current) =>
      Math.min(availableSuperlatives.length - 1, current + 1),
    );
    setExpandedSuperlative(null);
    setWinnerRevealed(false);
    setPodiumRevealed(false);
    setWinnerSettled(false);
  };

  const manualStepForward = () => {
    if (
      podiumRevealed &&
      activeSlideIndex >= availableSuperlatives.length - 1
    ) {
      return;
    }
    if (podiumRevealed) {
      setSlideDirection("right");
      setSlideIndex((current) =>
        Math.min(availableSuperlatives.length - 1, current + 1),
      );
      setExpandedSuperlative(null);
      setWinnerRevealed(false);
      setPodiumRevealed(false);
      setWinnerSettled(false);
    } else if (winnerRevealed) {
      setPodiumRevealed(true);
    } else {
      setWinnerRevealed(true);
    }
  };

  useEffect(() => {
    if (!activeSlide) return;
    const key: string = activeSlide[0];
    if (lastSlideKeyRef.current === key) return;
    lastSlideKeyRef.current = key;
    setWinnerRevealed(false);
    setPodiumRevealed(false);
    setWinnerSettled(false);
  }, [activeSlide]);

  useEffect(() => {
    if (!availableSuperlatives.length) return;
    if (deckRestoreDoneRef.current) return;
    deckRestoreDoneRef.current = true;
    let saved: {
      chatId: string | null;
      slideIndex: number;
      winnerRevealed: boolean;
      podiumRevealed: boolean;
      winnerSettled: boolean;
    } | null = null;
    try {
      saved = JSON.parse(window.sessionStorage.getItem(DECK_STATE_KEY) ?? "null");
    } catch {
      saved = null;
    }
    if (!saved) return;
    if (saved.chatId !== activeSavedReportId) return;
    const idx = Math.min(
      Math.max(0, saved.slideIndex ?? 0),
      availableSuperlatives.length - 1,
    );
    lastSlideKeyRef.current = availableSuperlatives[idx][0];
    setSlideIndex(idx);
    setWinnerRevealed(saved.winnerRevealed);
    setPodiumRevealed(saved.podiumRevealed);
    setWinnerSettled(saved.winnerSettled);
    setViewedSlides((prev) => new Set(prev).add(idx));
  }, [availableSuperlatives.length, activeSavedReportId]);

  useEffect(() => {
    if (!deckRestoreDoneRef.current) return;
    try {
      window.sessionStorage.setItem(
        DECK_STATE_KEY,
        JSON.stringify({
          chatId: activeSavedReportId,
          slideIndex,
          winnerRevealed,
          podiumRevealed,
          winnerSettled,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [
    slideIndex,
    winnerRevealed,
    podiumRevealed,
    winnerSettled,
    activeSavedReportId,
  ]);

  useEffect(() => {
    if (!activeSlide || !autoPlay) return;
    const PRE = 2500,
      REVEAL = 3000,
      PODIUM = 6000;
    const advance = () => {
      setExpandedSuperlative(null);
      setSlideIndex((current) => {
        if (current >= availableSuperlatives.length - 1) {
          setAutoPlay(false);
          return current;
        }
        setSlideDirection("right");
        return current + 1;
      });
    };
    const timers: number[] = [];
    if (!winnerRevealed) {
      timers.push(window.setTimeout(() => setWinnerRevealed(true), PRE));
      timers.push(
        window.setTimeout(() => setPodiumRevealed(true), PRE + REVEAL),
      );
      timers.push(window.setTimeout(advance, PRE + REVEAL + PODIUM));
    } else if (!podiumRevealed) {
      timers.push(window.setTimeout(() => setPodiumRevealed(true), REVEAL));
      timers.push(window.setTimeout(advance, REVEAL + PODIUM));
    } else {
      timers.push(window.setTimeout(advance, PODIUM));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [
    report,
    autoPlay,
    activeSlide?.[0],
    winnerRevealed,
    podiumRevealed,
    availableSuperlatives.length,
    visibilityTick,
  ]);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) return;
      setVisibilityTick((t) => t + 1);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    setViewedSlides((prev) => new Set(prev).add(activeSlideIndex));
  }, [activeSlideIndex]);

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
      name.style.transform =
        `translate(${dx}px, ${dy}px) scale(${scale})`;
    });
    const settle = window.setTimeout(() => {
      setWinnerSettled(true);
    }, 1100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [podiumRevealed]);

  useEffect(() => {
    if (!(activeSlide && activeWinner)) return;
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      event.preventDefault();
      manualStepForward();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSlide, activeWinner]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          CHAT<span> STATS</span>
        </div>
        <div className="account">
          {user ? (
            <div className="account-wrapper">
              <button
                className="user-line"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              >
                <span className="avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    (user.email ?? "?")[0].toUpperCase()
                  )}
                </span>
                <span title={user.email ?? "Signed in"}>{user.email}</span>
              </button>
              {accountMenuOpen && (
                <div className="account-dropdown">
                  <button onClick={openProfile}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Settings
                  </button>
                  <button onClick={signOut}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="google-button" onClick={signInWithGoogle}>
              Continue with Google
            </button>
          )}
        </div>
        <button
          className={`sidebar-tab${homeView ? " active" : ""}`}
          onClick={() => {
            pushChatIdInUrl(null);
            openChatById(null);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ verticalAlign: "-2px", marginRight: 6 }}
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Home
        </button>
        <div className="history-heading">
          <span>Saved group chats</span>
          <div className="history-heading-actions">
            {user && savedReports.length > 0 && (
              <button
                className="search-button"
                aria-label="Search chats"
                onClick={() => {
                  setSearchQuery("");
                  setSearchOpen(true);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            )}
            <span className="count">{savedReports.length}</span>
          </div>
        </div>
        <div className="history-list">
          {savedReports.length === 0 ? (
            <p className="empty-history">
              Your analyzed chats will appear here.
            </p>
          ) : (
            savedReports.map((item) => (
              <div className="history-item" key={item.id}>
                <button
                  className={
                    item.id === activeSavedReportId ? "active-chat" : undefined
                  }
                  onClick={() => {
                    pushChatIdInUrl(item.id);
                    openChatById(item.id);
                  }}
                >
                  <strong>{item.title}</strong>
                  <small>
                    {item.message_count} messages ·{" "}
                    {formatDate(item.created_at)}
                  </small>
                </button>
                <button
                  className="delete-button"
                  aria-label={`Delete ${item.title}`}
                  onClick={() => void removeReport(item.id)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <p className="sidebar-note">
          {user
            ? "Saved privately in your account."
            : "Saved in this browser. Sign in to keep history across devices."}
        </p>
      </aside>
      <main className="content">
        {loadingReport && (
          <section className="panel deck-loading">
            <p className="eyebrow">CHAT STATS</p>
            <div className="spinner" aria-hidden="true" />
            <p>Loading your report…</p>
          </section>
        )}
        {!loadingReport && homeView && (
          <>
            <section className="hero">
              <p className="eyebrow">CHAT STATS</p>
              <h1>
                {typedText}
                <span className="cursor">|</span>
              </h1>
              <p className="lede">
                Upload an iMessage export and get unexpected superlatives.
              </p>
            </section>
            <section className="panel">
              <form onSubmit={submit} className="upload-form">
                <div className="form-fields">
                  <label>
                    Chat export
                    <input
                      type="file"
                      accept=".json,.csv,.sqlite,.sqlite3,.db"
                      onChange={(event) =>
                        onFileChange(event.target.files?.[0] ?? null)
                      }
                    />
                    <small className="field-help">
                      Upload an iMessage chat.db file.
                    </small>
                  </label>
                  <label>
                    Contacts (optional)
                    <input
                      type="file"
                      accept=".vcf,.vcard"
                      onChange={(event) =>
                        void onContactsFileChange(
                          event.target.files?.[0] ?? null,
                        )
                      }
                    />
                    <small className="field-help">
                      {contactsFile
                        ? `${contactsFile.name} — ${contactsMap.size} contact${
                            contactsMap.size === 1 ? "" : "s"
                          } loaded.`
                        : "Optional .vcf export to map phone numbers to names."}
                    </small>
                  </label>
                  <label>
                    Timezone for timing metrics
                    <select
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    >
                      {TIMEZONE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <small className="field-help">
                      Used for time-based superlatives.
                    </small>
                  </label>
                </div>
                {unavailableFormat && (
                  <div className="under-construction upload-warning">
                    <strong>
                      {unavailableFormat} uploads are not available yet
                    </strong>
                    <span>
                      Please select an iMessage SQLite file to continue.
                    </span>
                  </div>
                )}
                <button
                  disabled={
                    !file ||
                    Boolean(unavailableFormat) ||
                    busy ||
                    selectedIsAnalyzed
                  }
                >
                  {busy
                    ? "Analyzing\u2026"
                    : unavailableFormat
                      ? "Format unavailable"
                      : conversationChoices.length > 0 &&
                          !selectedConversationId
                        ? "Choose a group chat"
                        : selectedIsAnalyzed
                          ? "Already saved"
                          : conversationChoices.length > 0
                            ? "Analyze selected chat"
                            : "Analyze chat"}
                </button>
              </form>
              {busy && (
                <div className="progress-panel">
                  <div className="progress-heading">
                    <strong>{progressStage}</strong>
                    <span>{progress}%</span>
                  </div>
                  <progress max="100" value={progress} />
                </div>
              )}
              {conversationChoices.length > 0 && (
                <div className="conversation-picker">
                  <label>
                    Search conversations
                    <div className="search-input-wrapper">
                      <input
                        type="search"
                        placeholder="Click to browse or type a group name…"
                        value={conversationSearch}
                        onFocus={() => setConversationSearchActive(true)}
                        onBlur={() => {
                          // Delay so click handlers on results fire first.
                          window.setTimeout(() => {
                            setConversationSearchActive(false);
                          }, 150);
                        }}
                        onChange={(event) => {
                          setConversationSearchActive(true);
                          setConversationSearch(event.target.value);
                        }}
                      />
                      {selectedConversationId && (
                        <button
                          type="button"
                          className="search-clear-btn"
                          onClick={() => {
                            setConversationSearchActive(true);
                            setSelectedConversationId("");
                            setConversationSearch("");
                          }}
                          aria-label="Clear selection"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </label>
                  {(() => {
                    const selectedChoice = selectedConversationId
                      ? [...conversationChoices, ...visibleChoices].find(
                          (c) => c.conversation_id === selectedConversationId,
                        )
                      : null;
                    const showDropdown =
                      conversationSearchActive || selectedChoice;
                    if (!showDropdown) {
                      return (
                        <p className="privacy">
                          Click the search bar to browse all{" "}
                          {conversationChoices.length} conversations.
                        </p>
                      );
                    }
                    return (
                      <>
                        {selectedChoice && !conversationSearchActive && (
                          <div className="conversation-results" role="listbox">
                            <button
                              type="button"
                              role="option"
                              aria-selected
                              className="conversation-result selected collapsed-selected"
                              onClick={() => setConversationSearchActive(true)}
                            >
                              <span>
                                <strong>
                                  {selectedChoice.title}
                                  {analyzedChoiceIds.has(
                                    selectedChoice.conversation_id,
                                  ) && (
                                    <span className="analyzed-badge">
                                      Previously analyzed
                                    </span>
                                  )}
                                </strong>
                                <small>
                                  {selectedChoice.participant_count} people ·{" "}
                                  {selectedChoice.message_count} messages
                                  {" \u00b7 Click to change"}
                                </small>
                              </span>
                            </button>
                          </div>
                        )}
                        {conversationSearchActive && (
                          <>
                            <div
                              className="conversation-results"
                              role="listbox"
                              aria-label="Conversations"
                            >
                              {selectedConversationId
                                ? (() => {
                                    const selected = visibleChoices.find(
                                      (c) =>
                                        c.conversation_id ===
                                        selectedConversationId,
                                    );
                                    if (!selected) return null;
                                    const isAnalyzed = analyzedChoiceIds.has(
                                      selected.conversation_id,
                                    );
                                    return (
                                      <button
                                        type="button"
                                        role="option"
                                        aria-selected
                                        className="conversation-result selected"
                                        onClick={() => {
                                          setConversationSearchActive(true);
                                          setSelectedConversationId("");
                                          setConversationSearch("");
                                        }}
                                      >
                                        <span>
                                          <strong>
                                            {selected.title}
                                            {isAnalyzed && (
                                              <span className="analyzed-badge">
                                                Previously analyzed
                                              </span>
                                            )}
                                          </strong>
                                          <small>
                                            {selected.participant_names?.length
                                              ? selected.participant_names.join(
                                                  ", ",
                                                )
                                              : selected.is_named
                                                ? "Named group or conversation"
                                                : "Other conversation"}
                                          </small>
                                        </span>
                                        <span className="conversation-stats">
                                          {selected.participant_count} people ·{" "}
                                          {selected.message_count} messages
                                          {isAnalyzed && (
                                            <span className="update-hint">
                                              \nClick Analyze to update
                                            </span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })()
                                : visibleChoices.map((choice) => {
                                    const isAnalyzed = analyzedChoiceIds.has(
                                      choice.conversation_id,
                                    );
                                    return (
                                      <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        disabled={isAnalyzed}
                                        className={`conversation-result${isAnalyzed ? " previously-analyzed" : ""}`}
                                        onClick={() => {
                                          setConversationSearchActive(true);
                                          setSelectedConversationId(
                                            choice.conversation_id,
                                          );
                                        }}
                                        key={choice.conversation_id}
                                      >
                                        <span>
                                          <strong>
                                            {choice.title}
                                            {isAnalyzed && (
                                              <span className="analyzed-badge">
                                                Previously analyzed
                                              </span>
                                            )}
                                          </strong>
                                          <small>
                                            {choice.participant_names?.length
                                              ? choice.participant_names.join(
                                                  ", ",
                                                )
                                              : choice.is_named
                                                ? "Named group or conversation"
                                                : "Other conversation"}
                                          </small>
                                        </span>
                                        <span className="conversation-stats">
                                          {choice.participant_count} people ·{" "}
                                          {choice.message_count} messages
                                        </span>
                                      </button>
                                    );
                                  })}
                            </div>
                            {!selectedConversationId && (
                              <p className="privacy">
                                Showing {visibleChoices.length} of{" "}
                                {conversationChoices.length} conversations.
                                Named groups are listed first; click a
                                conversation to select or update it.
                              </p>
                            )}
                            {visibleChoices.length === 0 &&
                              !selectedConversationId && (
                                <p className="error">
                                  No conversations match that search.
                                </p>
                              )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              <p className="privacy">
                With Google sign-in, reports are saved to your private account
                history.
              </p>
              {error && <p className="error">{error}</p>}
            </section>
            <section className="panel instructions-panel">
              <h2>How to get your chat file</h2>
              <details open>
                <summary>iMessage on a Mac</summary>
                <ol>
                  <li>
                    Open Finder and choose <strong>Go → Go to Folder</strong>.
                  </li>
                  <li>
                    Enter <code>~/Library/Messages/</code> and press Enter.
                  </li>
                  <li>
                    Make a copy of <code>chat.db</code> and upload the copy.
                    Never move or edit the original.
                  </li>
                  <li>
                    If the database contains multiple conversations, the app
                    will show a list so you can choose the group chat to
                    analyze.
                  </li>
                  <li>
                    Do not upload screenshots, PDFs, a media folder, or your
                    entire phone backup.
                  </li>
                </ol>
                <p className="privacy">
                  Apple usually stores phone numbers and emails in{" "}
                  <code>chat.db</code>, not your Contacts names. Upload a{" "}
                  <strong>Contacts .vcf export</strong> (below) and matching
                  numbers are mapped to names automatically. After analysis you
                  can still use the <strong>Name participants</strong> panel to
                  label anyone. The deck shows each person's first name; full
                  names stay in the <strong>Name participants</strong> panel and
                  in the saved report.
                </p>
              </details>
              <details>
                <summary>
                  Export your Contacts as a vCard (.vcf) on a Mac
                </summary>
                <ol>
                  <li>
                    Open the <strong>Contacts</strong> app on your Mac.
                  </li>
                  <li>
                    Select the contacts you want to include. To choose everyone,
                    use <strong>Edit → Select All</strong>.
                  </li>
                  <li>
                    In the menu bar choose{" "}
                    <strong>File → Export → Export vCard</strong>.
                  </li>
                  <li>
                    Save the file (it will have the <code>.vcf</code> extension)
                    somewhere you can find it.
                  </li>
                  <li>
                    Back here, upload that <code>.vcf</code> in the{" "}
                    <strong>Contacts (optional)</strong> field alongside your{" "}
                    <code>chat.db</code>, then analyze.
                  </li>
                </ol>
                <p className="privacy">
                  The file is read entirely on this page and never leaves your
                  browser (only the resulting report is sent as usual).
                </p>
              </details>
              <div className="locked-format" aria-disabled="true">
                <span>Instagram group chat</span>
                <span className="coming-soon-pill">Coming soon · locked</span>
              </div>
              <div className="locked-format" aria-disabled="true">
                <span>CSV file</span>
                <span className="coming-soon-pill">Coming soon · locked</span>
              </div>
              <hr className="format-divider" />
              <p className="privacy">
                Currently supported: iMessage <code>chat.db</code>,{" "}
                <code>.sqlite</code>, or <code>.sqlite3</code> files. Instagram
                and CSV uploads are temporarily unavailable.
              </p>
            </section>
          </>
        )}
        {displayedReport && (
          <section>
            <div className="summary">
              <div>
                <span>Conversation</span>
                <strong>{displayedReport.conversation_summary.title}</strong>
              </div>
              <div>
                <span>Messages</span>
                <strong>{animMessages}</strong>
              </div>
              <div>
                <span>Participants</span>
                <strong>{animParticipants}</strong>
              </div>
              <div>
                <span>Reactions</span>
                <strong>{animReactions}</strong>
              </div>
            </div>
            {activeSlide && activeWinner && (
              <>
                <div className="deck-counter-row">
                  <div className="deck-counter">
                    SUPERLATIVE {activeSlideIndex + 1} OF{" "}
                    {availableSuperlatives.length}
                  </div>
                  <button
                    type="button"
                    className="autoplay-toggle"
                    onClick={() => setAutoPlay((p) => !p)}
                    aria-label={
                      autoPlay ? "Pause auto-advance" : "Start auto-advance"
                    }
                    title={autoPlay ? "Pause slideshow" : "Auto-advance slides"}
                  >
                    {autoPlay ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    )}
                    <span>{autoPlay ? "Pause" : "Play"}</span>
                  </button>
                </div>
                <div className="deck-stage">
                  <div
                    className={`superlative-deck${podiumRevealed ? " podium-deck" : ""}`}
                    onClick={(event) => {
                      const target = event.target as HTMLElement | null;
                      if (
                        target?.closest(
                          ".deck-arrow, .deck-dot, .expand-button, .winner-suspense, .winner-spotlight",
                        )
                      ) {
                        return;
                      }
                      manualStepForward();
                    }}
                  >
                    <div
                      key={`${activeSlide[0]}-${activeSlideIndex}`}
                      className="deck-slide-content"
                      data-direction={slideDirection}
                    >
                      <div className="deck-intro">
                        <span className="deck-category">
                          {titleLabels[activeSlide[0]] ?? activeSlide[0]}
                        </span>
                        <p>
                          {superlativeDescriptions[activeSlide[0]] ??
                            "A group-chat ranking based on message activity."}
                        </p>
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
                          className="deck-arrow deck-arrow-left"
                          aria-label="Previous superlative"
                          disabled={activeSlideIndex === 0}
                          onClick={() => {
                            setSlideDirection("left");
                            setSlideIndex((current) =>
                              Math.max(0, current - 1),
                            );
                            setExpandedSuperlative(null);
                            setWinnerRevealed(false);
                            setPodiumRevealed(false);
                            setWinnerSettled(false);
                          }}
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
                          className="deck-arrow deck-arrow-right"
                          aria-label="Next superlative"
                          disabled={
                            activeSlideIndex ===
                            availableSuperlatives.length - 1
                          }
                          onClick={advanceToNextSlide}
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
                          <div
                            className="winner-suspense"
                            onClick={() => setWinnerRevealed(true)}
                            style={{ cursor: "pointer" }}
                          >
                            <div className="winner-skeleton">
                              <div className="skeleton-bar skeleton-bar-lg" />
                              <div className="skeleton-bar skeleton-bar-sm" />
                              <div className="skeleton-bar skeleton-bar-md" />
                            </div>
                            <p className="winner-tease">
                              Tap to reveal the winner
                            </p>
                          </div>
                        )}
                        {winnerRevealed && (
                          <div
                            className="winner-spotlight"
                            onClick={() => {
                              if (!podiumRevealed) setPodiumRevealed(true);
                            }}
                            style={
                              !podiumRevealed
                                ? { cursor: "pointer" }
                                : undefined
                            }
                          >
                            <span className="winner-label">1ST PLACE</span>
                            <h2
                              ref={winnerNameRef}
                              className={`winner-name${podiumRevealed ? " landing" : ""}${winnerSettled ? " settled" : ""}`}
                            >
                              {activeWinner.participant}
                            </h2>
                          </div>
                        )}
                        {podiumRevealed && (
                          <div className="podium-section">
                            <div className="podium">
                              <div className="podium-bars">
                                {podium2nd && (
                                  <div className="podium-bar-unit">
                                    <span className="podium-bar-name podium-name-silver">
                                      <img
                                        src="/crown-silver.svg"
                                        alt=""
                                        className="podium-crown"
                                      />{" "}
                                      {podium2nd.participant}
                                    </span>
                                    <div className="podium-bar podium-silver">
                                      <div className="podium-placement-circle podium-circle-silver">
                                        {podiumRows.length > 1 ? "2" : "-"}
                                      </div>
                                      <span className="podium-bar-outof">
                                        out of {podiumRows.length}
                                      </span>
                                      <span className="podium-bar-stat">
                                        {podiumPrimaryStat(
                                          activeSlide[0],
                                          podium2nd,
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <div className="podium-bar-unit">
                                  <span className="podium-bar-name podium-name-gold">
                                    <img
                                      ref={podiumCrownRef}
                                      src="/crown-gold.svg"
                                      alt=""
                                      className="podium-crown"
                                    />
                                    <span
                                      ref={podiumFinalNameRef}
                                      className={`podium-final-name${winnerSettled ? " visible" : ""}`}
                                    >
                                      {activeWinner.participant}
                                    </span>
                                  </span>
                                  <div className="podium-bar podium-gold">
                                    <div className="podium-placement-circle podium-circle-gold">
                                      {podiumRows.length > 0 ? "1" : "-"}
                                    </div>
                                    <span className="podium-bar-outof">
                                      out of {podiumRows.length}
                                    </span>
                                    <span className="podium-bar-stat">
                                      {podiumPrimaryStat(
                                        activeSlide[0],
                                        activeWinner,
                                      )}
                                    </span>
                                  </div>
                                </div>
                                {podium3rd && (
                                  <div className="podium-bar-unit">
                                    <span className="podium-bar-name podium-name-bronze">
                                      <img
                                        src="/crown-bronze.svg"
                                        alt=""
                                        className="podium-crown"
                                      />{" "}
                                      {podium3rd.participant}
                                    </span>
                                    <div className="podium-bar podium-bronze">
                                      <div className="podium-placement-circle podium-circle-bronze">
                                        {podiumRows.length > 2 ? "3" : "-"}
                                      </div>
                                      <span className="podium-bar-outof">
                                        out of {podiumRows.length}
                                      </span>
                                      <span className="podium-bar-stat">
                                        {podiumPrimaryStat(
                                          activeSlide[0],
                                          podium3rd,
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="podium-detail">
                              {rankingDetail(activeSlide[0], activeWinner)}
                            </p>
                            <div className="deck-action-row">
                              <button
                                type="button"
                                className="expand-button"
                                onClick={() =>
                                  setExpandedSuperlative(
                                    expandedSuperlative === activeSlide[0]
                                      ? null
                                      : activeSlide[0],
                                  )
                                }
                              >
                                {expandedSuperlative === activeSlide[0]
                                  ? "Hide full ranking"
                                  : `Expand ranking · ${podiumRows.length} members`}
                              </button>
                            </div>
                            {expandedSuperlative === activeSlide[0] && (
                              <div className="ranking-collapse-wrapper open">
                                <div className="ranking-collapse-inner">
                                  <div className="ranking-panel">
                                    <strong>Full ranking</strong>
                                    {podiumRows.length === 0 ? (
                                      <p className="privacy">
                                        Detailed rankings are not available for
                                        this saved report.
                                      </p>
                                    ) : (
                                      <ol>
                                        {podiumRows.map((row, index) => (
                                          <li
                                            key={
                                              row.participant_id ??
                                              `${activeSlide[0]}-${row.participant}-${index}`
                                            }
                                          >
                                            <div>
                                              <strong>
                                                {`${index + 1}. ${row.participant}`}
                                              </strong>
                                              <span>
                                                {rankingDetail(
                                                  activeSlide[0],
                                                  row,
                                                )}
                                              </span>
                                            </div>
                                          </li>
                                        ))}
                                      </ol>
                                    )}
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
                      {availableSuperlatives.map(([key], index) => (
                        <button
                          type="button"
                          key={key}
                          className={
                            key === activeSlide[0]
                              ? "deck-dot active"
                              : viewedSlides.has(index)
                                ? "deck-dot viewed"
                                : "deck-dot"
                          }
                          aria-label={`Go to ${titleLabels[key] ?? key}`}
                          aria-current={
                            key === activeSlide[0] ? "step" : undefined
                          }
                          onClick={() => {
                            const targetIndex = availableSuperlatives.findIndex(
                              ([slideKey]) => slideKey === key,
                            );
                            setSlideDirection(
                              targetIndex > activeSlideIndex ? "right" : "left",
                            );
                            setSlideIndex(targetIndex);
                            setExpandedSuperlative(null);
                            setWinnerRevealed(false);
                            setPodiumRevealed(false);
                            setWinnerSettled(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {availableSuperlatives.length === 0 && (
              <div className="panel">
                <p>No superlatives have enough data to display yet.</p>
              </div>
            )}
            <p className="note">
              The category and first-place position appear before the winner is
              revealed. Use the arrows or dots to move through the superlatives.
            </p>
            {contactsFile && unmatchedCount > 0 && (
              <p className="note">
                {unmatchedCount} phone number{unmatchedCount === 1 ? "" : "s"}{" "}
                {unmatchedCount === 1 ? "was" : "were"} not found in your
                contacts file. Use the Name participants panel below to label{" "}
                {unmatchedCount === 1 ? "it" : "them"}.
              </p>
            )}
            {participantsToName.length > 0 && (
              <div className="panel names-panel">
                <h2>Name participants</h2>
                <p className="privacy">
                  Assign a name to every participant in the conversation below.
                </p>
                <div className="name-fields">
                  {participantsToName.map((person) => {
                    const isMe = person.participant_id === meId;
                    const inputValue = isMe
                      ? (participantNames[person.participant_id] ?? username)
                      : (participantNames[person.participant_id] ?? "");
                    return (
                      <label key={person.participant_id}>
                        <span>
                          {person.display_name === "Me"
                            ? username.trim()
                              ? `You (default: ${firstNameOf(username)})`
                              : "You"
                            : person.display_name}
                        </span>
                        <input
                          value={inputValue}
                          onChange={(event) =>
                            setParticipantNames((current) => ({
                              ...current,
                              [person.participant_id]: event.target.value,
                            }))
                          }
                          placeholder={
                            isMe && username.trim()
                              ? firstNameOf(username)
                              : "New name"
                          }
                        />
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => void applyParticipantNames()}
                >
                  Apply names
                </button>
              </div>
            )}
          </section>
        )}
        {settingsOpen && user && (
          <div
            className="settings-overlay"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="settings-modal-head">
                <h2 id="settings-title">Settings</h2>
                <button
                  type="button"
                  className="settings-close"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close settings"
                >
                  ×
                </button>
              </div>
              <div className="settings-body">
                <p className="settings-hint">
                  No settings here yet. Use Profile to manage your name and
                  picture.
                </p>
              </div>
            </div>
          </div>
        )}

        {profileOpen && user && (
          <div
            className="settings-overlay"
            onClick={() => setProfileOpen(false)}
          >
            <div
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="settings-modal-head">
                <h2 id="profile-title">Edit profile</h2>
                <button
                  type="button"
                  className="settings-close"
                  onClick={() => setProfileOpen(false)}
                  aria-label="Close profile"
                >
                  ×
                </button>
              </div>
              <div className="settings-body profile-body">
                <div className="profile-avatar-wrap">
                  <span className="avatar-profile">
                    {avatarDraft ? (
                      <img
                        src={URL.createObjectURL(avatarDraft)}
                        alt="Profile preview"
                      />
                    ) : avatarUrl ? (
                      <img src={avatarUrl} alt="" />
                    ) : (
                      (user.email ?? "?")[0].toUpperCase()
                    )}
                    <label className="avatar-camera" title="Change picture">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            setAvatarDraft(file);
                            setRemoveAvatarFlag(false);
                          }
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </span>
                </div>
                <div className="profile-fields">
                  <label className="settings-field profile-field-floating">
                    <span className="settings-label">Display name</span>
                    <input
                      value={usernameDraft}
                      onChange={(event) => setUsernameDraft(event.target.value)}
                      placeholder={
                        username.trim()
                          ? firstNameOf(username)
                          : "Set a username"
                      }
                    />
                  </label>
                </div>
                <div className="settings-footer">
                  <button
                    type="button"
                    className="settings-cancel"
                    onClick={() => setProfileOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="settings-save"
                    onClick={() => void handleSaveProfile()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {searchOpen && (
          <div
            className="settings-overlay"
            onClick={() => setSearchOpen(false)}
          >
            <div
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="search-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="settings-modal-head">
                <h2 id="search-title">Search chats</h2>
                <button
                  type="button"
                  className="settings-close"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                >
                  ×
                </button>
              </div>
              <div className="settings-body">
                <input
                  className="search-input"
                  placeholder="Search by title…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  autoFocus
                />
                <div className="search-results">
                  {searchQueryLower && filteredReports.length === 0 ? (
                    <p className="empty-history">
                      No chats match “{searchQuery}”.
                    </p>
                  ) : (
                    filteredReports.map((item) => (
                      <button
                        type="button"
                        className="search-result"
                        key={item.id}
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery("");
                          pushChatIdInUrl(item.id);
                          openChatById(item.id);
                        }}
                      >
                        <strong>{item.title}</strong>
                        <small>
                          {item.message_count} messages ·{" "}
                          {formatDate(item.created_at)}
                        </small>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
