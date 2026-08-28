from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)
EMOJI_BASE = r"[\U0001F300-\U0001FAFF\u2600-\u27BF]"
EMOJI_MODIFIER = r"[\uFE0F\U0001F3FB-\U0001F3FF]"
EMOJI_RE = re.compile(
    rf"(?:"
    rf"[\U0001F1E6-\U0001F1FF]{{2}}"  # regional-indicator flag
    rf"|[0-9#*]{EMOJI_MODIFIER}?\u20E3"  # keycap emoji
    rf"|{EMOJI_BASE}(?:{EMOJI_MODIFIER}|\u200D{EMOJI_BASE})*"
    rf")"
)
WORD_RE = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?")


def stable_id(prefix: str, value: Any) -> str:
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, (int, float)):
        number = float(value)
        if number > 1e17:
            number /= 1e9
        elif number > 1e14:
            number /= 1e6
        elif number > 1e11:
            number /= 1e3
        result = datetime.fromtimestamp(number, tz=timezone.utc)
    else:
        text = str(value or "").strip()
        if not text:
            raise ValueError("message is missing a timestamp")
        result = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def extract_emojis(text: str) -> list[str]:
    return EMOJI_RE.findall(text)


def extract_links(text: str) -> list[str]:
    return URL_RE.findall(text)


def normalize_contact(value: str) -> str:
    """Normalize a phone number or email to a canonical lookup key.

    Phone numbers are reduced to digits only; emails are lowercased.
    """
    text = value.strip()
    if "@" in text:
        return text.casefold()
    return re.sub(r"\D", "", text)


def classify_media(value: Any) -> str:
    text = str(value or "").lower()
    if not text:
        return "none"
    if "http://" in text or "https://" in text:
        return "link"
    if any(token in text for token in ("image", "jpeg", "png", "heic", "gif", "public.jpeg", "public.png")) or any(ext in text for ext in (".jpg", ".jpeg", ".png", ".heic", ".gif")):
        return "photo"
    if any(token in text for token in ("video", "movie", "mpeg", "quicktime")) or any(ext in text for ext in (".mp4", ".mov", ".m4v")):
        return "video"
    if any(token in text for token in ("audio", "m4a", "mpeg-4-audio")) or any(ext in text for ext in (".mp3", ".m4a", ".wav")):
        return "audio"
    return "file"


STOPWORDS = frozenset(
    """
    a an and are as at be but by for from has have he her here hers him his how
    i if in into is it its me mine my of on or our ours she so than that the
    their theirs them themselves then there these they this those to too up us
    was we were what when where which while who whom why will with you your
    yours yourself i'm you're we're they're he's she's it's don't can't won't
    isn't aren't didn't doesn't wasn't weren't haven't hasn't hadn't would
    could should shall may might must one like get got just im gonna wanna
    lets let's got u ur ya dont cant wont thats that's whats what's whos
    who's theres there's heres here's weve we've ive i've youve you've theyve
    they've it'll you'll i'll we'll they'll ima bout all any both each few more
    most other some such only own same very really also even about above after
    again against along amid among around because before behind below beneath
    beside besides between beyond down during every following inside into near
    off onto out outside over past still through throughout till toward under
    underneath until upon via yes no ok okay well oh know know i know
    """.split()
)

# Matches tokens that look like hashes, UUIDs, or hex IDs (4+ hex chars).
_HASH_RE = re.compile(r"^[0-9a-f]{4,}$")



def tokenize_words(text: str) -> list[str]:
    """Return meaningful lowercase words, stripping stopwords and noise.

    Words shorter than three characters and pure numbers are discarded so the
    remaining tokens represent genuine vocabulary.
    """
    result: list[str] = []
    for match in WORD_RE.finditer(str(text or "")):
        token = match.group(0).casefold().strip("'’")
        if len(token) < 3:
            continue
        if token.isdigit():
            continue
        if token in STOPWORDS:
            continue
        if _HASH_RE.match(token):
            continue
        result.append(token)
    return result


def stem_word(word: str) -> str:
    """Reduce a word to a shared stem for grouping related forms.

    A small hand-rolled suffix stripper (Porter-inspired) that collapses
    common inflections without native NLP dependencies. It is deliberately
    conservative so distinct roots are not over-merged.
    """
    token = word.casefold()
    if len(token) <= 3:
        return token
    if token in {
        "news", "analysis", "basis", "series", "species", "status",
        "his", "hers", "ours", "yours", "this", "those", "them",
    }:
        return token
    for suffix in (
        "ization", "isation", "ational", "ations", "tional", "iveness",
        "fulness", "ousness", "ement", "ments", "ingly", "edly", "ness",
        "ment", "ing", "ed", "est", "er", "ies", "ied", "ly", "es", "s",
    ):
        if token.endswith(suffix) and len(token) - len(suffix) >= 3:
            stem = token[:-len(suffix)]
            if suffix in ("ies", "ied"):
                stem = stem[:-1] + "y"
            # Collapse doubled consonant: running → runn → run.
            if (
                len(stem) >= 2
                and stem[-1] == stem[-2]
                and stem[-1] not in "aeiou"
                and suffix in ("ing", "ed", "er")
            ):
                stem = stem[:-1]
            return stem
    if token.endswith("'s") and len(token) > 3:
        return token[:-2]
    return token
