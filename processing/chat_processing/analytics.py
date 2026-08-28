from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median
from typing import Any
from zoneinfo import ZoneInfo

from .models import CanonicalDataset, Message, Reaction, ReplyEdge
from .normalization import extract_emojis, extract_links, normalize_contact, tokenize_words

LAUGH_RE = re.compile(r"\b(?:lol+|lmao+|lmfao+|haha+|rofl|dead|dying)\b", re.IGNORECASE)
SURPRISE_RE = re.compile(r"\b(?:omg|no way|what|wtf|wow|shut up)\b", re.IGNORECASE)
AGREEMENT_RE = re.compile(r"\b(?:exactly|same|this|true|facts|yes|yesss|right)\b", re.IGNORECASE)
LOW_SIGNAL_RE = re.compile(r"^(?:ok|okay|k|kk|sure|yep|yup|👍|\.+)$", re.IGNORECASE)
QUESTION_RE = re.compile(r"\?")
LAUGH_EMOJIS = {"😂", "🤣", "😆", "😹", "😭"}

LONG_SILENCE_SECONDS = 4 * 60 * 60
TIME_TRAVELER_MIN_SECONDS = LONG_SILENCE_SECONDS
GRAMMAR_MIN_MESSAGES = 5
WORDSMITH_MIN_MESSAGES = 20
TRENDSETTER_MIN_SPREAD = 1
FORMAL_GRAMMAR_MARKERS = re.compile(
    r"\b(?:please|thank you|thanks|could you|would you|however|therefore|although|"
    r"in addition|for example|to clarify|as a result|i would|we should|kindly)\b",
    re.IGNORECASE,
)


def _message_map(dataset: CanonicalDataset) -> dict[str, Message]:
    return {message.message_id: message for message in dataset.messages}


def _reaction_map(dataset: CanonicalDataset) -> dict[str, list[Reaction]]:
    result: dict[str, list[Reaction]] = defaultdict(list)
    for reaction in dataset.reactions:
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


def _add_mc_volume_weight(rankings: list[dict[str, Any]], volume_weight: float = 0.35) -> None:
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


def main_character_index(dataset: CanonicalDataset, window_seconds: int = 60) -> dict[str, Any]:
    del window_seconds  # Kept in the signature for report compatibility; replies no longer affect the Main Character.
    messages = [message for message in dataset.sorted_messages() if not message.is_system_message and not message.is_deleted]
    reactions = _reaction_map(dataset)
    possible_reactors = max(1, len(dataset.participants) - 1)
    by_sender: dict[str, list[float]] = defaultdict(list)
    reaction_totals: Counter[str] = Counter()
    reacted_messages: Counter[str] = Counter()
    reaction_types_by_sender: dict[str, Counter[str]] = defaultdict(Counter)
    evidence_by_message: dict[str, dict[str, Any]] = {}

    for message in messages:
        # Every reaction type (positive, negative, neutral) contributes one equal
        # unit. We deduplicate the same actor/type pair so repeated export rows
        # cannot inflate a score.
        message_reactions = reactions.get(message.message_id, [])
        unique_reactions = {(reaction.actor_id, reaction.reaction_emoji) for reaction in message_reactions if reaction.actor_id != message.sender_id}
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
    _add_mc_volume_weight(rankings)
    rankings.sort(key=lambda item: (item["ranking_score"], item["score"], item["total_reactions"]), reverse=True)
    return {
        "title": "The Main Character",
        "metric": "main_character_index",
        "rankings": rankings,
        "reaction_policy": "All native reaction types (positive, negative, and neutral) carry equal base weight within this conversation; a like, laugh, dislike, or question all count the same. Replies, reply timing, and text content do not affect the score. The displayed ranking blends 65% average reaction impact with 35% log-scaled total reaction volume.",
        "total_reactions": sum(reaction_totals.values()),
        "messages_with_reactions": sum(reacted_messages.values()),
        "message_evidence": evidence_by_message,
    }


def _eligible(messages: list[Message]) -> list[Message]:
    return [message for message in messages if not message.is_system_message and not message.is_deleted]


def _participant_names(dataset: CanonicalDataset) -> dict[str, str]:
    return {participant.participant_id: participant.display_name for participant in dataset.participants}


def _reply_parent_lookup(messages: list[Message]) -> tuple[dict[str, Message], dict[str, Message]]:
    by_id = {message.message_id: message for message in messages}
    by_source_id = {
        str(message.source_message_id): message
        for message in messages
        if message.source_message_id
    }
    return by_id, by_source_id


def _explicit_reply_parent(
    message: Message,
    by_id: dict[str, Message],
    by_source_id: dict[str, Message],
) -> Message | None:
    if not message.reply_to_message_id:
        return None
    reference = str(message.reply_to_message_id)
    return by_id.get(reference) or by_source_id.get(reference)


def ghost_metrics(dataset: CanonicalDataset, messages: list[Message]) -> list[dict[str, Any]]:
    """Rank participants by absolute participation in the selected conversation.

    This intentionally includes known participants with zero messages. They may
    have appeared as a reaction actor or in the export's participant roster,
    which makes the title useful for the quietest person rather than only the
    quietest active sender.
    """
    names = _participant_names(dataset)
    counts = Counter(message.sender_id for message in messages)
    active_days: dict[str, set[str]] = defaultdict(set)
    for message in messages:
        active_days[message.sender_id].add(message.timestamp_utc.date().isoformat())
    total_messages = len(messages)
    rows = []
    for participant_id, name in names.items():
        count = counts[participant_id]
        rows.append(
            {
                "participant": name,
                "participant_id": participant_id,
                "message_count": count,
                "message_share": round(count / max(1, total_messages), 4),
                "active_days": len(active_days[participant_id]),
                "scope": "selected conversation",
            }
        )
    return sorted(rows, key=lambda row: (row["message_count"], row["active_days"], row["participant"]))


def time_traveler_metrics(dataset: CanonicalDataset, messages: list[Message]) -> list[dict[str, Any]]:
    """Find unusually late replies or returns after a conversation went quiet.

    An explicit reply reference is preferred. If the export has no reply
    metadata, a message after a 4+ hour gap from the previous participant's
    message is treated as a return after silence. This captures both a direct
    reply to an old message and a late continuation that the source format did
    not label explicitly.
    """
    names = _participant_names(dataset)
    by_id, by_source_id = _reply_parent_lookup(messages)
    indexes = {message.message_id: index for index, message in enumerate(messages)}
    records: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, current in enumerate(messages):
        parent = _explicit_reply_parent(current, by_id, by_source_id)
        method = "explicit_reply"
        if parent is None and index > 0:
            parent = messages[index - 1]
            method = "return_after_silence"
        if parent is None or parent.sender_id == current.sender_id:
            continue
        seconds_late = (current.timestamp_utc - parent.timestamp_utc).total_seconds()
        if seconds_late < TIME_TRAVELER_MIN_SECONDS:
            continue
        parent_index = indexes.get(parent.message_id, index - 1)
        records[current.sender_id].append(
            {
                "message_id": current.message_id,
                "parent_message_id": parent.message_id,
                "seconds_late": seconds_late,
                "method": method,
                "intervening_messages": max(0, index - parent_index - 1),
            }
        )

    def _trimmed_mean_hours(items: list[dict[str, Any]]) -> float:
        """Drop the bottom and top quartiles to resist outliers."""
        values = sorted(item["seconds_late"] for item in items)
        n = len(values)
        if n <= 3:
            return sum(values) / n / 3600
        lower = n // 4
        upper = n - n // 4
        trimmed = values[lower:upper]
        return sum(trimmed) / len(trimmed) / 3600

    average_hours = {
        participant_id: _trimmed_mean_hours(items)
        for participant_id, items in records.items()
    }
    max_count = max((len(items) for items in records.values()), default=0)
    max_average = max(average_hours.values(), default=0.0)
    rows = []
    for participant_id, name in names.items():
        items = records.get(participant_id, [])
        count = len(items)
        average = average_hours.get(participant_id, 0.0)
        count_signal = count / max_count if max_count else 0.0
        lateness_signal = math.log1p(average) / math.log1p(max_average) if max_average else 0.0
        rows.append(
            {
                "participant": name,
                "participant_id": participant_id,
                "late_reply_count": count,
                "average_late_hours": round(average, 2),
                "longest_late_hours": round(max((item["seconds_late"] for item in items), default=0) / 3600, 2),
                "intervening_messages": sum(item["intervening_messages"] for item in items),
                "explicit_late_replies": sum(item["method"] == "explicit_reply" for item in items),
                "ranking_score": round(100 * (0.7 * count_signal + 0.3 * lateness_signal), 1),
            }
        )
    return sorted(
        rows,
        key=lambda row: (row["ranking_score"], row["late_reply_count"], row["average_late_hours"]),
        reverse=True,
    )


def _grammar_features(text: str) -> dict[str, float]:
    words = re.findall(r"\b[A-Za-z]+(?:['’][A-Za-z]+)?\b", text)
    if not words:
        return {"score": 0.0, "punctuation": 0.0, "capitalization": 0.0, "formal": 0.0}
    starts = re.findall(r"(?:^|[.!?\n])\s*[\"'([{]*([A-Za-z])", text)
    capitalization = sum(letter.isupper() for letter in starts) / max(1, len(starts))
    sentence_like_count = max(1, len(re.findall(r"[^.!?\n]+", text)))
    terminal_punctuation = bool(re.search(r"[.!?]\s*$", text))
    punctuation = min(1.0, (sum(character in ",.!?;:" for character in text) / max(1, len(words) / 8)))
    punctuation_quality = 0.65 * float(terminal_punctuation) + 0.35 * punctuation
    formal = min(1.0, len(FORMAL_GRAMMAR_MARKERS.findall(text)) / max(1, sentence_like_count))
    score = 100 * (0.4 * punctuation_quality + 0.35 * capitalization + 0.25 * formal)
    return {
        "score": score,
        "punctuation": punctuation_quality,
        "capitalization": capitalization,
        "formal": formal,
    }


def grammar_police_metrics(dataset: CanonicalDataset, messages: list[Message]) -> list[dict[str, Any]]:
    names = _participant_names(dataset)
    by_sender: dict[str, list[dict[str, float]]] = defaultdict(list)
    for message in messages:
        # Emoji-only, media-only, and empty messages do not provide evidence of
        # punctuation or sentence capitalization.
        if not re.search(r"[A-Za-z]", message.text):
            continue
        by_sender[message.sender_id].append(_grammar_features(message.text))
    rows = []
    for participant_id, name in names.items():
        features = by_sender.get(participant_id, [])
        count = len(features)
        rows.append(
            {
                "participant": name,
                "participant_id": participant_id,
                "grammar_score": round(sum(item["score"] for item in features) / max(1, count), 1),
                "proper_punctuation_rate": round(sum(item["punctuation"] for item in features) / max(1, count) * 100, 1),
                "capitalization_rate": round(sum(item["capitalization"] for item in features) / max(1, count) * 100, 1),
                "formal_marker_rate": round(sum(item["formal"] for item in features) / max(1, count) * 100, 1),
                "grammar_messages": count,
                "minimum_sample": GRAMMAR_MIN_MESSAGES,
            }
        )
    return sorted(rows, key=lambda row: (row["grammar_score"], row["grammar_messages"]), reverse=True)


def wordsmith_metrics(dataset: CanonicalDataset, messages: list[Message]) -> list[dict[str, Any]]:
    """Rank participants by the size of their unique (non-stopword) vocabulary."""
    names = _participant_names(dataset)
    wordset: dict[str, set[str]] = defaultdict(set)
    text_count: Counter[str] = Counter()
    total_count: Counter[str] = Counter()
    for message in messages:
        if not message.text:
            continue
        words = tokenize_words(message.text)
        if not words:
            continue
        text_count[message.sender_id] += 1
        wordset[message.sender_id].update(words)
        total_count[message.sender_id] += len(words)
    rows = []
    for participant_id, name in names.items():
        rows.append(
            {
                "participant": name,
                "participant_id": participant_id,
                "unique_words": len(wordset.get(participant_id, set())),
                "total_words": total_count.get(participant_id, 0),
                "eligible_messages": text_count.get(participant_id, 0),
                "minimum_sample": WORDSMITH_MIN_MESSAGES,
                "scope": "selected conversation",
            }
        )
    return sorted(rows, key=lambda row: (row["unique_words"], row["total_words"], row["participant"]), reverse=True)


def trendsetter_metrics(dataset: CanonicalDataset, messages: list[Message]) -> list[dict[str, Any]]:
    """Rank participants by vocabulary they introduced first that others adopted."""
    names = _participant_names(dataset)
    first_user: dict[str, str] = {}
    user_words: dict[str, set[str]] = defaultdict(set)
    for message in messages:
        words = set(tokenize_words(message.text)) if message.text else set()
        if not words:
            continue
        participant_id = message.sender_id
        user_words[participant_id].update(words)
        for word in words:
            if word not in first_user:
                first_user[word] = participant_id
    spread: dict[str, set[str]] = defaultdict(set)
    for participant_id, words in user_words.items():
        for word in words:
            spread[word].add(participant_id)
    counts: Counter[str] = Counter()
    for word, introducer in first_user.items():
        others = spread.get(word, set()) - {introducer}
        if len(others) >= TRENDSETTER_MIN_SPREAD:
            counts[introducer] += 1
    rows = []
    for participant_id, name in names.items():
        rows.append(
            {
                "participant": name,
                "participant_id": participant_id,
                "first_use_terms": counts.get(participant_id, 0),
                "scope": "selected conversation",
            }
        )
    return sorted(rows, key=lambda row: (row["first_use_terms"], row["participant"]), reverse=True)


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
        longest_msg = max(text_messages, key=lambda m: m.word_count, default=None)
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
        results["novelist"].append({"participant": name, "participant_id": sender_id, "average_words": round(sum(words) / max(1, len(words)), 2), "eligible_messages": len(words), "longest_message": longest_msg.text if longest_msg else None, "longest_message_words": longest_msg.word_count if longest_msg else 0})
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
    results["ghost"] = ghost_metrics(dataset, messages)
    results["time_traveler"] = time_traveler_metrics(dataset, messages)
    results["grammar_police"] = grammar_police_metrics(dataset, messages)
    return {key: sorted(value, key=lambda item: item.get("participant", "")) for key, value in results.items()}


def build_report(dataset: CanonicalDataset, progress_callback: Any | None = None) -> dict[str, Any]:
    messages = _eligible(dataset.messages)
    participants = {participant.participant_id: participant.display_name for participant in dataset.participants}
    if progress_callback:
        progress_callback(45, "Preparing messages")
    main_character = main_character_index(dataset)
    if progress_callback:
        progress_callback(65, "Calculating reaction-based Main Character")
    metrics = basic_metrics(dataset)
    metrics.update(
        {
            "wordsmith": wordsmith_metrics(dataset, messages),
            "trendsetter": trendsetter_metrics(dataset, messages),
        }
    )
    if progress_callback:
        progress_callback(85, "Calculating activity and style metrics")
    media_winner = max(metrics["media_spammer"], key=lambda item: item["ranking_score"], default=None)
    titles = {
        "main_character": main_character["rankings"][0] if main_character["rankings"] else None,
        "double_texter": max(metrics["double_texter"], key=lambda item: item["rate"], default=None),
        "novelist": max(metrics["novelist"], key=lambda item: item["average_words"], default=None),
        "conversation_starter": max(metrics["conversation_starter"], key=lambda item: item["ranking_score"], default=None),
        "night_owl": max(metrics["night_owl"], key=lambda item: item["share"], default=None),
        "early_bird": max(metrics["early_bird"], key=lambda item: item["share"], default=None),
        "emoji_addict": max(metrics["emoji_addict"], key=lambda item: item["ranking_score"], default=None),
        "media_spammer": media_winner if media_winner and media_winner["total_media_items"] > 0 else None,
        "quick_draw": min((item for item in metrics["quick_draw"] if item["median_reply_seconds"] is not None), key=lambda item: item["median_reply_seconds"], default=None),
        "ghost": min(metrics["ghost"], key=lambda item: (item["message_count"], item["active_days"]), default=None),
        "time_traveler": max((item for item in metrics["time_traveler"] if item["late_reply_count"] > 0), key=lambda item: item["ranking_score"], default=None),
        "grammar_police": max((item for item in metrics["grammar_police"] if item["grammar_messages"] >= item["minimum_sample"]), key=lambda item: item["grammar_score"], default=None),
        "wordsmith": max((item for item in metrics["wordsmith"] if item["eligible_messages"] >= item["minimum_sample"]), key=lambda item: item["unique_words"], default=None),
        "trendsetter": max((item for item in metrics["trendsetter"] if item["first_use_terms"] > 0), key=lambda item: item["first_use_terms"], default=None),
    }
    result = {"report_metadata": {"analytics_version": "0.3.0", "source_format": dataset.conversation.source_format, "timezone": dataset.conversation.timezone, "privacy_mode": "local_or_ephemeral_cloud"}, "conversation_summary": {"title": dataset.conversation.title, "message_count": len(messages), "participant_count": len(participants), "date_start": min((message.timestamp_utc.isoformat() for message in messages), default=None), "date_end": max((message.timestamp_utc.isoformat() for message in messages), default=None)}, "participants": [{"participant_id": key, "display_name": value} for key, value in participants.items()], "titles": titles, "leaderboards": {"main_character": main_character, **metrics}, "warnings": dataset.warnings, "quality": {"reply_attribution": "explicit when available, chronological heuristic otherwise", "raw_text_retained": False,            "superlative_sample_rules": {"grammar_police": f"requires at least {GRAMMAR_MIN_MESSAGES} text messages", "wordsmith": f"requires at least {WORDSMITH_MIN_MESSAGES} text messages"}}}
    if progress_callback:
        progress_callback(95, "Finalizing report")
    return result
