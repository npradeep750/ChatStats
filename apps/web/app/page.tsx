"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "../lib/supabase/client";

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
  comedian: "The Comedian",
  novelist: "The Novelist",
  double_texter: "The Double Texter",
  conversation_starter: "The Conversation Starter",
  night_owl: "The Night Owl",
  early_bird: "The Early Bird",
  emoji_addict: "The Emoji Addict",
  media_spammer: "The Media Spammer",
  quick_draw: "The Quick-Draw Responder",
  ghost: "The Ghost",
  time_traveler: "The Time Traveler",
  grammar_police: "The Grammar Police",
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
  const humor = leaderboards.humor;
  const compactHumor =
    humor && typeof humor === "object" && !Array.isArray(humor)
      ? Object.fromEntries(
          Object.entries(humor as Record<string, unknown>).filter(
            ([key]) => key !== "message_evidence",
          ),
        )
      : humor;
  return {
    ...nextReport,
    leaderboards: { ...leaderboards, humor: compactHumor },
  };
}

const superlativeDescriptions: Record<string, string> = {
  comedian:
    "The participant whose messages are the funniest based on average and total positive reaction volume.",
  double_texter:
    "The participant most likely to send multiple messages in a row before someone else replies.",
  novelist:
    "The participant who writes the longest messages on average, based on word count.",
  conversation_starter:
    "The participant who most often starts the conversation after at least four hours of silence.",
  night_owl:
    "The participant with the strongest share of messages sent between midnight and 6 a.m.",
  early_bird:
    "The participant with the strongest share of messages sent between 6 a.m. and 9 a.m.",
  emoji_addict:
    "The participant with the strongest emoji habit, based on average and total emoji volume.",
  media_spammer:
    "The participant with the strongest media habit, based on average and total volume of photos, videos, files, and links.",
  quick_draw:
    "The participant with the fastest typical reply time to another participant.",
  ghost:
    "The participant with the fewest messages in this selected conversation.",
  time_traveler:
    "The participant most likely to reply four or more hours after a message and after the group has gone quiet.",
  grammar_police:
    "The participant who uses the most sentence-ending punctuation, capitalization, and formal grammar markers.",
};

const leaderboardNames: Record<string, string> = { comedian: "humor" };

function leaderboardRows(nextReport: Report, key: string): Ranking[] {
  const source = nextReport.leaderboards?.[leaderboardNames[key] ?? key];
  const rawRows =
    key === "comedian" &&
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
              : key === "comedian"
                ? "ranking_score"
                : ["emoji_addict", "media_spammer", "time_traveler"].includes(
                      key,
                    )
                  ? "ranking_score"
                  : key === "grammar_police"
                    ? "grammar_score"
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
  if (key === "comedian")
    return `${row.ranking_score ?? row.score ?? 0} comedy score · ${row.total_reactions ?? 0} positive reactions · ${row.reaction_rate ?? 0}% of messages reacted to`;
  if (key === "double_texter")
    return `${row.rate ?? 0}% double-text rate · longest run ${row.max_run ?? 0} messages`;
  if (key === "novelist") {
    const longWords = row.longest_message_words ?? 0;
    return (
      `${row.average_words ?? 0} average words · ${row.eligible_messages ?? 0} text messages · longest message ` +
      (longWords > 0 ? `\n${longWords} words` : "")
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
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [report, setReport] = useState<Report | null>(null);
  const [conversationChoices, setConversationChoices] = useState<
    ConversationOption[]
  >([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSearchActive, setConversationSearchActive] =
    useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeSavedReportId, setActiveSavedReportId] = useState<string | null>(
    null,
  );
  const [homeView, setHomeView] = useState(true);
  const [participantNames, setParticipantNames] = useState<
    Record<string, string>
  >({});
  const [expandedSuperlative, setExpandedSuperlative] = useState<string | null>(
    null,
  );
  const [slideIndex, setSlideIndex] = useState(0);
  const [winnerRevealed, setWinnerRevealed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSavedReports(readLocalReports());
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
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      if (data.user) void loadReports();
      else setSavedReports(readLocalReports());
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) void loadReports();
        else setSavedReports(readLocalReports());
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

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
          setReport(current.report);
          setParticipantNames({});
          setExpandedSuperlative(null);
          setSlideIndex(0);
          setWinnerRevealed(false);
          setActiveSavedReportId(await saveReport(current.report));
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
    }
  }

  function onFileChange(nextFile: File | null) {
    setFile(nextFile);
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
    setError("");
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
    selectedConversationId !== "" && analyzedChoiceIds.has(selectedConversationId);

  const displayedReport = report
    ? withParticipantNames(report, participantNames)
    : null;
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
  const humorLeaderboard = displayedReport?.leaderboards?.humor;
  const totalPositiveReactions =
    humorLeaderboard &&
    typeof humorLeaderboard === "object" &&
    !Array.isArray(humorLeaderboard) &&
    typeof (humorLeaderboard as { total_positive_reactions?: unknown })
      .total_positive_reactions === "number"
      ? (humorLeaderboard as { total_positive_reactions: number })
          .total_positive_reactions
      : leaderboardRows(displayedReport ?? ({} as Report), "comedian").reduce(
          (total, row) => total + (row.total_reactions ?? 0),
          0,
        );

  useEffect(() => {
    if (!activeSlide) return;
    setWinnerRevealed(false);
    const revealTimer = window.setTimeout(() => setWinnerRevealed(true), 1700);
    return () => window.clearTimeout(revealTimer);
  }, [report, activeSlide?.[0]]);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          CHAT<span> STATS</span>
        </div>
        <div className="account">
          {user ? (
            <>
              <div className="user-line">
                <span className="avatar">
                  {(user.email ?? "?")[0].toUpperCase()}
                </span>
                <span title={user.email ?? "Signed in"}>{user.email}</span>
              </div>
              <button className="text-button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button className="google-button" onClick={signInWithGoogle}>
              Continue with Google
            </button>
          )}
        </div>
        <button
          className={`sidebar-tab${homeView ? " active" : ""}`}
          onClick={() => {
            setHomeView(true);
            setActiveSavedReportId(null);
            setReport(null);
            setParticipantNames({});
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign: "-2px", marginRight: 6}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Home
        </button>
        <div className="history-heading">
          <span>Saved group chats</span>
          <span className="count">{savedReports.length}</span>
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
                  onClick={() => {
                    setHomeView(false);
                    setReport(item.report);
                    setParticipantNames(storedParticipantNames(item.report));
                    setExpandedSuperlative(null);
                    setSlideIndex(0);
                    setWinnerRevealed(false);
                    setActiveSavedReportId(item.id);
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
            ? "Saved privately to your Supabase account."
            : "Saved in this browser. Sign in to keep history across devices."}
        </p>
      </aside>
      <main className="content">
        {homeView && (
        <>
        <section className="hero">
          <p className="eyebrow">CHAT STATS</p>
          <h1>Find out who really runs the group chat.</h1>
          <p className="lede">
            Upload an iMessage export and get unexpected superlatives.
          </p>
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
                Make a copy of <code>chat.db</code> and upload the copy. Never
                move or edit the original.
              </li>
              <li>
                If the database contains multiple conversations, the app will
                show a list so you can choose the group chat to analyze.
              </li>
              <li>
                Do not upload screenshots, PDFs, a media folder, or your entire
                phone backup.
              </li>
            </ol>
            <p className="privacy">
              Apple usually stores phone numbers and emails in{" "}
              <code>chat.db</code>, not your Contacts names. After analysis, use
              the <strong>Name participants</strong> panel to label each person.
              Those labels are saved with the report.
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
          <p className="privacy">
            Currently supported: iMessage <code>chat.db</code>,{" "}
            <code>.sqlite</code>, or <code>.sqlite3</code> files. Instagram and
            CSV uploads are temporarily unavailable.
          </p>
        </section>
        <section className="panel">
          <form onSubmit={submit}>
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
                iMessage files are supported now. Instagram JSON and CSV are
                under construction.
              </small>
            </label>
            {unavailableFormat && (
              <div className="under-construction upload-warning">
                <strong>
                  {unavailableFormat} uploads are not available yet
                </strong>
                <span>Please select an iMessage SQLite file to continue.</span>
              </div>
            )}
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
                Used for time-based superlatives. Message timestamps stay in UTC
                internally.
              </small>
            </label>
            <button
              disabled={
                !file ||
                Boolean(unavailableFormat) ||
                busy ||
                selectedIsAnalyzed
              }
            >
              {busy
                ? "Analyzing…"
                : unavailableFormat
                  ? "Format unavailable"
                  : conversationChoices.length > 0 && !selectedConversationId
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
                const showDropdown = conversationSearchActive || selectedChoice;
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
                              {analyzedChoiceIds.has(selectedChoice.conversation_id) && (
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
                          {selectedConversationId ? (
                            (() => {
                              const selected = visibleChoices.find(
                                (c) =>
                                  c.conversation_id === selectedConversationId,
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
                                        ? selected.participant_names.join(", ")
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
                          ) : (
                            visibleChoices.map((choice) => {
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
                                        ? choice.participant_names.join(", ")
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
                            })
                          )}
                        </div>
                        {!selectedConversationId && (
                          <p className="privacy">
                            Showing {visibleChoices.length} of{" "}
                            {conversationChoices.length} conversations. Named
                            groups are listed first; click a conversation to
                            select or update it.
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
                <strong>
                  {displayedReport.conversation_summary.message_count}
                </strong>
              </div>
              <div>
                <span>Participants</span>
                <strong>
                  {displayedReport.conversation_summary.participant_count}
                </strong>
              </div>
              <div>
                <span>Positive reactions</span>
                <strong>{totalPositiveReactions}</strong>
              </div>
            </div>
            {activeSlide && activeWinner && (
              <>
                <div className="deck-counter">
                  SUPERLATIVE {activeSlideIndex + 1} OF{" "}
                  {availableSuperlatives.length}
                </div>
                <div className="deck-stage">
                  <div className="superlative-deck">
                    <div className="deck-intro">
                      <span className="deck-category">
                        {titleLabels[activeSlide[0]] ?? activeSlide[0]}
                      </span>
                      <p>
                        {superlativeDescriptions[activeSlide[0]] ??
                          "A playful group-chat ranking based on message activity."}
                      </p>
                    </div>
                    <div
                      className={
                        winnerRevealed ? "deck-winner revealed" : "deck-winner"
                      }
                    >
                      <span className="winner-label">1ST PLACE</span>
                      {!winnerRevealed ? (
                        <>
                          <div className="winner-hidden">???</div>
                          <p className="winner-tease">Revealing the winner…</p>
                        </>
                      ) : (
                        <>
                          <h2 className="winner-name">
                            {activeWinner.participant}
                          </h2>
                          <p>{rankingDetail(activeSlide[0], activeWinner)}</p>
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
                              : `Expand ranking · ${leaderboardRows(displayedReport, activeSlide[0]).length} members`}
                          </button>
                          {expandedSuperlative === activeSlide[0] && (
                            <div className="ranking-panel">
                              <strong>Full ranking</strong>
                              {leaderboardRows(displayedReport, activeSlide[0])
                                .length === 0 ? (
                                <p className="privacy">
                                  Detailed rankings are not available for this
                                  saved report.
                                </p>
                              ) : (
                                <ol>
                                  {leaderboardRows(
                                    displayedReport,
                                    activeSlide[0],
                                  ).map((row, index) => (
                                    <li
                                      key={
                                        row.participant_id ??
                                        `${activeSlide[0]}-${row.participant}-${index}`
                                      }
                                    >
                                      <div>
                                        <strong>{row.participant}</strong>
                                        <span>
                                          {rankingDetail(activeSlide[0], row)}
                                        </span>
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="deck-navigation">
                    <button
                      type="button"
                      className="deck-arrow"
                      aria-label="Previous superlative"
                      disabled={activeSlideIndex === 0}
                      onClick={() => {
                        setSlideIndex((current) => Math.max(0, current - 1));
                        setExpandedSuperlative(null);
                        setWinnerRevealed(false);
                      }}
                    >
                      ← <span>Previous</span>
                    </button>
                    <div className="deck-dots" aria-label="Superlative slides">
                      {availableSuperlatives.map(([key]) => (
                        <button
                          type="button"
                          key={key}
                          className={
                            key === activeSlide[0]
                              ? "deck-dot active"
                              : "deck-dot"
                          }
                          aria-label={`Go to ${titleLabels[key] ?? key}`}
                          aria-current={
                            key === activeSlide[0] ? "step" : undefined
                          }
                          onClick={() => {
                            setSlideIndex(
                              availableSuperlatives.findIndex(
                                ([slideKey]) => slideKey === key,
                              ),
                            );
                            setExpandedSuperlative(null);
                            setWinnerRevealed(false);
                          }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="deck-arrow"
                      aria-label="Next superlative"
                      disabled={
                        activeSlideIndex === availableSuperlatives.length - 1
                      }
                      onClick={() => {
                        setSlideIndex((current) =>
                          Math.min(
                            availableSuperlatives.length - 1,
                            current + 1,
                          ),
                        );
                        setExpandedSuperlative(null);
                        setWinnerRevealed(false);
                      }}
                    >
                      <span>Next</span> →
                    </button>
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
            {participantsToName.length > 0 && (
              <div className="panel names-panel">
                <h2>Name participants</h2>
                <p className="privacy">
                  The export identifies people by phone number or email. Add
                  names below so every card and leaderboard uses a friendly
                  name. You can name yourself too. These labels stay in your
                  saved report.
                </p>
                <div className="name-fields">
                  {participantsToName.map((person) => (
                    <label key={person.participant_id}>
                      <span>
                        {person.display_name === "Me"
                          ? "You (currently shown as Me)"
                          : person.display_name}
                      </span>
                      <input
                        value={participantNames[person.participant_id] ?? ""}
                        onChange={(event) =>
                          setParticipantNames((current) => ({
                            ...current,
                            [person.participant_id]: event.target.value,
                          }))
                        }
                        placeholder={
                          person.display_name === "Me"
                            ? "Enter your name"
                            : "Enter a name"
                        }
                      />
                    </label>
                  ))}
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
      </main>
    </div>
  );
}
