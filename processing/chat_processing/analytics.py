from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median
from typing import Any
from zoneinfo import ZoneInfo

from .models import CanonicalDataset, Message, Reaction, ReplyEdge
from .normalization import extract_emojis, extract_links

LAUGH_RE = re.compile(r"\b(?:lol+|lmao+|lmfao+|haha+|rofl|dead|dying)\b", re.IGNORECASE)
SURPRISE_RE = re.compile(r"\b(?:omg|no way|what|wtf|wow|shut up)\b", re.IGNORECASE)
AGREEMENT_RE = re.compile(r"\b(?:exactly|same|this|true|facts|yes|yesss|right)\b", re.IGNORECASE)
LOW_SIGNAL_RE = re.compile(r"^(?:ok|okay|k|kk|sure|yep|yup|👍|\.+)$", re.IGNORECASE)
QUESTION_RE = re.compile(r"\?")
LAUGH_EMOJIS = {"😂", "🤣", "😆", "😹", "😭"}
POSITIVE_REACTIONS = {"❤️", "❤", "💕", "💖", "💗", "💓", "💞", "💘", "💝", "😍", "😂", "🤣", "😆", "👍", "👏", "🔥"}


def _message_map(dataset: CanonicalDataset) -> dict[str, Message]:
    return {message.message_id: message for message in dataset.messages}


def _reaction_map(dataset: CanonicalDataset) -> dict[str, list[Reaction]]:
    result: dict[str, list[Reaction]] = defaultdict(list)
    for reaction in dataset.reactions:
        if reaction.reaction_emoji in POSITIVE_REACTIONS or reaction.reaction_type == "positive":
            result[reaction.message_id].append(reaction)
    return result


def classify_reply(text: str) -> dict[str, Any]:
    normalized = text.strip()
    emojis = set(extract_emojis(normalized))
    labels: list[str] = []
    if LAUGH_RE.search(normalized) or emojis & LAUGH_EMOJIS:
        labels.append("laughter")
    if SURPRISE_RE.search(normalized) or "😳" in emojis or "🤯" in emojis:
        labels.append("surprise")
    if AGREEMENT_RE.search(normalized):
        labels.append("playful_agreement")
    if QUESTION_RE.search(normalized):
        labels.append("question")
    if len(normalized.split()) >= 5 and not labels:
        labels.append("substantive_continuation")
    if not labels and LOW_SIGNAL_RE.match(normalized):
        labels.append("low_signal")
    if not labels:
        labels.append("positive_reinforcement" if normalized else "low_signal")
    return {"labels": labels, "word_count": len(normalized.split()), "emoji_count": len(emojis)}


def attribute_replies(dataset: CanonicalDataset, window_seconds: int = 60) -> list[ReplyEdge]:
    messages = dataset.sorted_messages()
    edges: list[ReplyEdge] = []
    explicit_ids = {message.source_message_id: message.message_id for message in messages if message.source_message_id}
    for index, reply in enumerate(messages):
        if reply.reply_to_message_id:
            parent_id = explicit_ids.get(reply.reply_to_message_id, reply.reply_to_message_id)
            parent = next((message for message in messages if message.message_id == parent_id), None)
            if parent and parent.sender_id != reply.sender_id:
                edges.append(ReplyEdge(parent.message_id, reply.message_id, max(0.0, (reply.timestamp_utc - parent.timestamp_utc).total_seconds()), "explicit", 1.0))
                continue
        for parent in reversed(messages[max(0, index - 5):index]):
            seconds = (reply.timestamp_utc - parent.timestamp_utc).total_seconds()
            if seconds < 0:
                continue
            if seconds > window_seconds:
                break
            if parent.sender_id != reply.sender_id:
                edges.append(ReplyEdge(parent.message_id, reply.message_id, seconds, "chronological", 0.65))
                break
    return edges


def _add_humor_volume_weight(rankings: list[dict[str, Any]], volume_weight: float = 0.35) -> None:
    """Blend average reaction impact with total positive reaction volume."""
    if not rankings:
        return
    max_reactions = max(float(row.get("total_reactions", 0) or 0) for row in rankings)
    log_max_reactions = math.log1p(max_reactions)
    intensity_weight = 1 - volume_weight
    for row in rankings:
        reaction_signal = float(row.get("score", 0) or 0) / 100
        reaction_volume = float(row.get("total_reactions", 0) or 0)
        volume_signal = math.log1p(reaction_volume) / log_max_reactions if log_max_reactions else 0
        row["ranking_score"] = round(100 * (intensity_weight * reaction_signal + volume_weight * volume_signal), 1)


def humor_index(dataset: CanonicalDataset, window_seconds: int = 60) -> dict[str, Any]:
    del window_seconds  # Kept in the signature for report compatibility; replies no longer affect Humor.
    messages = [message for message in dataset.sorted_messages() if not message.is_system_message and not message.is_deleted]
    reactions = _reaction_map(dataset)
    possible_reactors = max(1, len(dataset.participants) - 1)
    by_sender: dict[str, list[float]] = defaultdict(list)
    reaction_totals: Counter[str] = Counter()
    reacted_messages: Counter[str] = Counter()
    reaction_types_by_sender: dict[str, Counter[str]] = defaultdict(Counter)
    evidence_by_message: dict[str, dict[str, Any]] = {}

    for message in messages:
        # Every positive reaction type contributes one equal unit. We deduplicate
        # the same actor/type pair so repeated export rows cannot inflate a score.
        positive_reactions = reactions.get(message.message_id, [])
        unique_reactions = {(reaction.actor_id, reaction.reaction_emoji) for reaction in positive_reactions if reaction.actor_id != message.sender_id}
        reaction_count = len(unique_reactions)
        reaction_signal = min(1.0, reaction_count / possible_reactors)
        message_score = reaction_signal
        by_sender[message.sender_id].append(message_score)
        reaction_totals[message.sender_id] += reaction_count
        if reaction_count:
            reacted_messages[message.sender_id] += 1
        for _, emoji in unique_reactions:
            reaction_types_by_sender[message.sender_id][emoji] += 1
        evidence_by_message[message.message_id] = {"reaction_count": reaction_count, "reaction_signal": round(reaction_signal, 4), "message_score": round(message_score, 4), "reaction_types": dict(Counter(emoji for _, emoji in unique_reactions))}

    participants = {participant.participant_id: participant.display_name for participant in dataset.participants}
    rankings = []
    for sender_id, scores in by_sender.items():
        message_count = len(scores)
        average_reactions = reaction_totals[sender_id] / message_count
        reaction_rate = 100 * reacted_messages[sender_id] / message_count
        average_score = sum(scores) / message_count
        rankings.append({"participant_id": sender_id, "participant": participants.get(sender_id, sender_id), "score": round(100 * average_score, 1), "average_reactions": round(average_reactions, 3), "total_reactions": reaction_totals[sender_id], "reacted_messages": reacted_messages[sender_id], "reaction_rate": round(reaction_rate, 1), "reaction_types": dict(reaction_types_by_sender[sender_id]), "eligible_messages": message_count, "confidence": "high" if message_count >= 50 else "medium" if message_count >= 10 else "low"})
    _add_humor_volume_weight(rankings)
    rankings.sort(key=lambda item: (item["ranking_score"], item["score"], item["total_reactions"]), reverse=True)
    return {
        "title": "The Comedian",
        "metric": "humor_index",
        "rankings": rankings,
        "reaction_policy": "All positive reaction types have equal base weight within this conversation. Humor uses only native positive reactions; replies, reply timing, and text content do not affect the score. The displayed ranking blends 65% average reaction impact with 35% log-scaled total positive reaction volume.",
        "total_positive_reactions": sum(reaction_totals.values()),
        "messages_with_positive_reactions": sum(reacted_messages.values()),
        "message_evidence": evidence_by_message,
    }


def _eligible(messages: list[Message]) -> list[Message]:
    return [message for message in messages if not message.is_system_message and not message.is_deleted]


def _add_volume_weight(rows: list[dict[str, Any]], intensity_key: str, volume_key: str, volume_weight: float = 0.35) -> None:
    """Blend a normalized rate with log-scaled total volume.

    The logarithm gives genuinely active participants credit without allowing a
    participant with ten times as many messages to automatically overwhelm the
    rate-based signal.
    """
    if not rows:
        return
    max_intensity = max(float(row.get(intensity_key, 0) or 0) for row in rows)
    max_volume = max(float(row.get(volume_key, 0) or 0) for row in rows)
    log_max_volume = math.log1p(max_volume)
    intensity_weight = 1 - volume_weight
    for row in rows:
        intensity = float(row.get(intensity_key, 0) or 0)
        volume = float(row.get(volume_key, 0) or 0)
        intensity_signal = intensity / max_intensity if max_intensity else 0
        volume_signal = math.log1p(volume) / log_max_volume if log_max_volume else 0
        row["ranking_score"] = round(100 * (intensity_weight * intensity_signal + volume_weight * volume_signal), 1)


def basic_metrics(dataset: CanonicalDataset) -> dict[str, Any]:
    messages = _eligible(dataset.sorted_messages())
    local_timezone = ZoneInfo(dataset.conversation.timezone)
    participants = {participant.participant_id: participant.display_name for participant in dataset.participants}
    grouped: dict[str, list[Message]] = defaultdict(list)
    for message in messages:
        grouped[message.sender_id].append(message)
    results: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sender_id, own in grouped.items():
        name = participants.get(sender_id, sender_id)
        runs: list[int] = []
        current = 0
        for message in messages:
            if message.sender_id == sender_id:
                current += 1
            elif current:
                runs.append(current)
                current = 0
        if current:
            runs.append(current)
        text_messages = [message for message in own if message.text]
        words = [message.word_count for message in text_messages]
        emojis = Counter(emoji for message in own for emoji in extract_emojis(message.text))
        media: Counter[str] = Counter()
        for message in own:
            if message.media_type != "none":
                media[message.media_type] += max(1, message.media_count)
        local_hours = [message.timestamp_utc.astimezone(local_timezone).hour for message in own]
        night = sum(hour < 6 for hour in local_hours)
        early = sum(6 <= hour < 9 for hour in local_hours)
        message_count = len(own)
        total_emojis = sum(emojis.values())
        total_media_items = sum(media.values())
        results["double_texter"].append({"participant": name, "participant_id": sender_id, "rate": round(100 * sum(run >= 2 for run in runs) / max(1, len(own)), 2), "max_run": max(runs, default=0)})
        results["novelist"].append({"participant": name, "participant_id": sender_id, "average_words": round(sum(words) / max(1, len(words)), 2), "eligible_messages": len(words)})
        results["emoji_addict"].append({"participant": name, "participant_id": sender_id, "per_100_messages": round(100 * total_emojis / max(1, message_count), 2), "total_emojis": total_emojis, "message_count": message_count, "top_emojis": emojis.most_common(5)})
        results["media_spammer"].append({"participant": name, "participant_id": sender_id, "per_100_messages": round(100 * total_media_items / max(1, message_count), 2), "total_media_items": total_media_items, "message_count": message_count, "media": dict(media)})
        results["night_owl"].append({"participant": name, "participant_id": sender_id, "share": round(night / max(1, len(own)), 3), "messages": night})
        results["early_bird"].append({"participant": name, "participant_id": sender_id, "share": round(early / max(1, len(own)), 3), "messages": early})

    starts: Counter[str] = Counter()
    responders: dict[str, list[float]] = defaultdict(list)
    for previous, current in zip(messages, messages[1:]):
        gap = (current.timestamp_utc - previous.timestamp_utc).total_seconds()
        if gap >= 4 * 3600:
            starts[current.sender_id] += 1
        if current.sender_id != previous.sender_id and 0 <= gap <= 24 * 3600:
            responders[current.sender_id].append(gap)
    for sender_id in grouped:
        name = participants.get(sender_id, sender_id)
        values = responders.get(sender_id, [])
        message_count = len(grouped[sender_id])
        results["conversation_starter"].append({"participant": name, "participant_id": sender_id, "long_gap_starts": starts[sender_id], "starts_per_100_messages": round(100 * starts[sender_id] / max(1, message_count), 2), "message_count": message_count})
        results["quick_draw"].append({"participant": name, "participant_id": sender_id, "median_reply_seconds": round(median(values), 2) if values else None, "reply_count": len(values)})
    _add_volume_weight(results["emoji_addict"], "per_100_messages", "total_emojis")
    _add_volume_weight(results["media_spammer"], "per_100_messages", "total_media_items")
    _add_volume_weight(results["conversation_starter"], "starts_per_100_messages", "long_gap_starts")
    return {key: sorted(value, key=lambda item: item.get("participant", "")) for key, value in results.items()}


def build_report(dataset: CanonicalDataset, progress_callback: Any | None = None) -> dict[str, Any]:
    messages = _eligible(dataset.messages)
    participants = {participant.participant_id: participant.display_name for participant in dataset.participants}
    if progress_callback:
        progress_callback(45, "Preparing messages")
    humor = humor_index(dataset)
    if progress_callback:
        progress_callback(65, "Calculating reaction-based humor")
    metrics = basic_metrics(dataset)
    if progress_callback:
        progress_callback(85, "Calculating activity and style metrics")
    media_winner = max(metrics["media_spammer"], key=lambda item: item["ranking_score"], default=None)
    titles = {
        "comedian": humor["rankings"][0] if humor["rankings"] else None,
        "double_texter": max(metrics["double_texter"], key=lambda item: item["rate"], default=None),
        "novelist": max(metrics["novelist"], key=lambda item: item["average_words"], default=None),
        "conversation_starter": max(metrics["conversation_starter"], key=lambda item: item["ranking_score"], default=None),
        "night_owl": max(metrics["night_owl"], key=lambda item: item["share"], default=None),
        "early_bird": max(metrics["early_bird"], key=lambda item: item["share"], default=None),
        "emoji_addict": max(metrics["emoji_addict"], key=lambda item: item["ranking_score"], default=None),
        "media_spammer": media_winner if media_winner and media_winner["total_media_items"] > 0 else None,
        "quick_draw": min((item for item in metrics["quick_draw"] if item["median_reply_seconds"] is not None), key=lambda item: item["median_reply_seconds"], default=None),
    }
    result = {"report_metadata": {"analytics_version": "0.1.0", "source_format": dataset.conversation.source_format, "timezone": dataset.conversation.timezone, "privacy_mode": "local_or_ephemeral_cloud"}, "conversation_summary": {"title": dataset.conversation.title, "message_count": len(messages), "participant_count": len(participants), "date_start": min((message.timestamp_utc.isoformat() for message in messages), default=None), "date_end": max((message.timestamp_utc.isoformat() for message in messages), default=None)}, "participants": [{"participant_id": key, "display_name": value} for key, value in participants.items()], "titles": titles, "leaderboards": {"humor": humor, **metrics}, "warnings": dataset.warnings, "quality": {"reply_attribution": "explicit when available, chronological heuristic otherwise", "raw_text_retained": False}}
    if progress_callback:
        progress_callback(95, "Finalizing report")
    return result
