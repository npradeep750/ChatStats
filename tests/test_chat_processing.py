from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone

from processing.chat_processing.analytics import basic_metrics, classify_reply, humor_index
from processing.chat_processing.models import CanonicalDataset, Conversation, Message, Participant, Reaction
from processing.chat_processing.normalization import extract_emojis
from processing.chat_processing.pipeline import list_conversations, parse_bytes, process_file


def message(message_id: str, sender: str, seconds: int, text: str) -> Message:
    return Message(message_id, "c", sender, datetime.fromtimestamp(seconds, timezone.utc), text)


class AnalyticsTests(unittest.TestCase):
    def test_consecutive_emojis_are_counted_individually(self) -> None:
        self.assertEqual(extract_emojis("😂😂😂"), ["😂", "😂", "😂"])
        self.assertEqual(extract_emojis("👨‍👩‍👧‍👦"), ["👨‍👩‍👧‍👦"])
        self.assertEqual(extract_emojis("👍🏽👍🏽"), ["👍🏽", "👍🏽"])

    def test_timezone_changes_local_activity_metrics(self) -> None:
        messages = [message("m1", "a", 3600, "early UTC")]
        utc_dataset = CanonicalDataset(
            Conversation("c", "Test", "json", "UTC"),
            [Participant("a", "Ava", "c")],
            messages,
        )
        pacific_dataset = CanonicalDataset(
            Conversation("c", "Test", "json", "America/Los_Angeles"),
            [Participant("a", "Ava", "c")],
            messages,
        )
        utc_metrics = basic_metrics(utc_dataset)
        pacific_metrics = basic_metrics(pacific_dataset)
        self.assertEqual(utc_metrics["night_owl"][0]["messages"], 1)
        self.assertEqual(pacific_metrics["night_owl"][0]["messages"], 0)

    def test_volume_weight_rewards_repeated_activity(self) -> None:
        messages = [message("a1", "a", 0, "😀")]
        messages.extend(message(f"b{index}", "b", index, "😀") for index in range(1, 11))
        dataset = CanonicalDataset(
            Conversation("c", "Test", "json", "UTC"),
            [Participant("a", "Ava", "c"), Participant("b", "Ben", "c")],
            messages,
        )
        rows = {row["participant"]: row for row in basic_metrics(dataset)["emoji_addict"]}
        self.assertEqual(rows["Ava"]["per_100_messages"], rows["Ben"]["per_100_messages"])
        self.assertGreater(rows["Ben"]["total_emojis"], rows["Ava"]["total_emojis"])
        self.assertGreater(rows["Ben"]["ranking_score"], rows["Ava"]["ranking_score"])

    def test_reaction_types_have_equal_base_weight(self) -> None:
        dataset = CanonicalDataset(
            Conversation("c", "Test", "json"),
            [Participant("a", "Ava", "c"), Participant("b", "Ben", "c")],
            [message("m1", "a", 0, "joke one"), message("m2", "b", 10, "joke two")],
            [Reaction("r1", "m1", "b", "❤️"), Reaction("r2", "m2", "a", "😂")],
        )
        result = humor_index(dataset)
        self.assertEqual(result["message_evidence"]["m1"]["reaction_count"], 1)
        self.assertEqual(result["message_evidence"]["m2"]["reaction_count"], 1)
        self.assertEqual(result["reaction_policy"].startswith("All positive reaction types have equal"), True)

    def test_replies_do_not_contribute_to_humor(self) -> None:
        dataset = CanonicalDataset(
            Conversation("c", "Test", "json"),
            [Participant("a", "Ava", "c"), Participant("b", "Ben", "c")],
            [message("m1", "a", 0, "setup"), message("m2", "b", 5, "HAHA 😂"), message("m3", "a", 1000, "quiet")],
        )
        result = humor_index(dataset)
        self.assertEqual(result["message_evidence"]["m1"]["reaction_count"], 0)
        self.assertEqual(result["message_evidence"]["m1"]["message_score"], 0)

    def test_humor_volume_weight_rewards_repeated_reactions(self) -> None:
        messages = [message("a1", "a", 0, "joke")]
        messages.extend(message(f"b{index}", "b", index, "joke") for index in range(1, 11))
        reactions = [Reaction("ra", "a1", "b", "😂")]
        reactions.extend(Reaction(f"rb{index}", f"b{index}", "a", "❤️") for index in range(1, 11))
        dataset = CanonicalDataset(
            Conversation("c", "Test", "json"),
            [Participant("a", "Ava", "c"), Participant("b", "Ben", "c")],
            messages,
            reactions,
        )
        result = humor_index(dataset)
        rows = {row["participant"]: row for row in result["rankings"]}
        self.assertEqual(rows["Ava"]["score"], rows["Ben"]["score"])
        self.assertGreater(rows["Ben"]["ranking_score"], rows["Ava"]["ranking_score"])

    def test_humor_scores_use_absolute_audience_impact(self) -> None:
        dataset = CanonicalDataset(
            Conversation("c", "Test", "json"),
            [Participant("a", "Ava", "c"), Participant("b", "Ben", "c"), Participant("c", "Cam", "c")],
            [message("m1", "a", 0, "setup"), message("m2", "b", 5, "HAHA 😂"), message("m3", "c", 1000, "quiet")],
            [Reaction("r1", "m1", "b", "❤️"), Reaction("r2", "m1", "c", "😂")],
        )
        result = humor_index(dataset)
        scores = {row["participant"]: row["score"] for row in result["rankings"]}
        self.assertGreater(scores["Ava"], scores["Ben"])
        self.assertNotEqual(len({row["score"] for row in result["rankings"]}), 1)

    def test_reply_classifier_is_multilabel(self) -> None:
        result = classify_reply("lol exactly?")
        self.assertIn("laughter", result["labels"])
        self.assertIn("playful_agreement", result["labels"])
        self.assertIn("question", result["labels"])


class ParserTests(unittest.TestCase):
    def test_json_fixture_and_report(self) -> None:
        raw = json.dumps({"title": "Chat", "messages": [{"id": "1", "sender": "A", "timestamp": "2026-01-01T00:00:00Z", "text": "hello"}]}).encode()
        dataset = parse_bytes("chat.json", raw)
        self.assertEqual(dataset.conversation.source_format, "instagram_json")
        self.assertEqual(len(dataset.messages), 1)
        self.assertEqual(process_file("chat.json", raw)["conversation_summary"]["message_count"], 1)

    def test_csv_parser(self) -> None:
        raw = b"timestamp,sender,text\n2026-01-01T00:00:00Z,A,hello\n"
        dataset = parse_bytes("chat.csv", raw)
        self.assertEqual(dataset.messages[0].text, "hello")

    def test_sqlite_parser(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as handle:
            connection = sqlite3.connect(handle.name)
            connection.executescript("CREATE TABLE handle (id TEXT); CREATE TABLE message (text TEXT, handle_id INTEGER, date INTEGER);")
            connection.execute("INSERT INTO handle (id) VALUES ('ben@example.com')")
            connection.execute("INSERT INTO message VALUES ('hello', 1, 1767225600000000000)")
            connection.commit()
            connection.close()
            with open(handle.name, "rb") as sqlite_file:
                raw = sqlite_file.read()
        dataset = parse_bytes("chat.sqlite", raw)
        self.assertEqual(dataset.messages[0].text, "hello")
        self.assertEqual(dataset.participants[0].display_name, "ben@example.com")

    def test_sqlite_parser_reads_attachments_and_links(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as handle:
            connection = sqlite3.connect(handle.name)
            connection.executescript("""
                CREATE TABLE handle (id TEXT);
                CREATE TABLE message (text TEXT, handle_id INTEGER, date INTEGER, is_from_me INTEGER, cache_has_attachments INTEGER);
                CREATE TABLE attachment (mime_type TEXT, uti TEXT, filename TEXT, transfer_name TEXT);
                CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
            """)
            connection.execute("INSERT INTO handle (id) VALUES ('ben@example.com')")
            connection.execute("INSERT INTO message VALUES ('photo', 1, 1767225600000000000, 0, 1)")
            connection.execute("INSERT INTO message VALUES ('https://example.com', 1, 1767225601000000000, 0, 0)")
            connection.execute("INSERT INTO attachment VALUES ('image/jpeg', 'public.jpeg', 'photo.jpg', 'photo.jpg')")
            connection.execute("INSERT INTO message_attachment_join VALUES (1, 1)")
            connection.commit()
            connection.close()
            with open(handle.name, "rb") as sqlite_file:
                raw = sqlite_file.read()
        dataset = parse_bytes("chat.sqlite", raw)
        self.assertEqual(dataset.messages[0].media_type, "photo")
        self.assertEqual(dataset.messages[0].media_count, 1)
        self.assertEqual(dataset.messages[1].media_type, "link")
        self.assertEqual(dataset.messages[1].media_count, 1)

    def test_sqlite_parser_reads_native_tapbacks(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as handle:
            connection = sqlite3.connect(handle.name)
            connection.executescript("""
                CREATE TABLE handle (id TEXT);
                CREATE TABLE message (
                    text TEXT,
                    handle_id INTEGER,
                    date INTEGER,
                    is_from_me INTEGER,
                    associated_message_type INTEGER,
                    associated_message_id INTEGER,
                    guid TEXT
                );
            """)
            connection.execute("INSERT INTO handle (id) VALUES ('ava@example.com')")
            connection.execute("INSERT INTO handle (id) VALUES ('ben@example.com')")
            connection.execute("INSERT INTO message VALUES ('the original joke', 1, 1767225600000000000, 0, NULL, NULL, 'message-guid-1')")
            connection.execute("INSERT INTO message VALUES (NULL, 2, 1767225601000000000, 0, 2003, 1, 'tapback-guid-1')")
            connection.commit()
            connection.close()
            with open(handle.name, "rb") as sqlite_file:
                raw = sqlite_file.read()
        dataset = parse_bytes("chat.db", raw)
        self.assertEqual(len(dataset.messages), 1)
        self.assertEqual(len(dataset.reactions), 1)
        self.assertEqual(dataset.reactions[0].message_id, dataset.messages[0].message_id)
        self.assertEqual(dataset.reactions[0].reaction_emoji, "😂")
        self.assertEqual(dataset.reactions[0].reaction_type, "positive")

    def test_sqlite_parser_reads_text_form_tapbacks(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as handle:
            connection = sqlite3.connect(handle.name)
            connection.executescript("""
                CREATE TABLE handle (id TEXT);
                CREATE TABLE message (
                    text TEXT,
                    attributedBody BLOB,
                    handle_id INTEGER,
                    date INTEGER,
                    is_from_me INTEGER
                );
            """)
            connection.execute("INSERT INTO handle (id) VALUES ('ava@example.com')")
            connection.execute("INSERT INTO handle (id) VALUES ('ben@example.com')")
            connection.execute("INSERT INTO message VALUES ('Original', NULL, 1, 1767225600000000000, 0)")
            connection.execute(
                "INSERT INTO message VALUES (NULL, ?, 2, 1767225601000000000, 0)",
                ("698ALaughed at \u201cOriginal".encode("utf-8"),),
            )
            connection.execute(
                "INSERT INTO message VALUES (NULL, ?, 2, 1767225602000000000, 0)",
                ("Loved \u201cOriginal".encode("utf-8"),),
            )
            connection.execute(
                "INSERT INTO message VALUES (NULL, ?, 2, 1767225603000000000, 0)",
                ("Liked \u201cOriginal".encode("utf-8"),),
            )
            connection.commit()
            connection.close()
            with open(handle.name, "rb") as sqlite_file:
                raw = sqlite_file.read()
        dataset = parse_bytes("chat.db", raw)
        self.assertEqual(len(dataset.messages), 1)
        self.assertEqual(dataset.messages[0].text, "Original")
        self.assertEqual(len(dataset.reactions), 3)
        self.assertTrue(all(reaction.message_id == dataset.messages[0].message_id for reaction in dataset.reactions))
        self.assertEqual({reaction.reaction_emoji for reaction in dataset.reactions}, {"😂", "❤️", "👍"})

    def test_sqlite_parser_preserves_emoji_only_attributed_body(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as handle:
            connection = sqlite3.connect(handle.name)
            connection.executescript("""
                CREATE TABLE handle (id TEXT);
                CREATE TABLE message (
                    text TEXT,
                    attributedBody BLOB,
                    handle_id INTEGER,
                    date INTEGER,
                    is_from_me INTEGER
                );
            """)
            connection.execute("INSERT INTO handle (id) VALUES ('ava@example.com')")
            connection.execute(
                "INSERT INTO message VALUES (NULL, ?, 1, 1767225600000000000, 0)",
                ("😂😂😂 👍🏽".encode("utf-8"),),
            )
            connection.commit()
            connection.close()
            with open(handle.name, "rb") as sqlite_file:
                raw = sqlite_file.read()
        dataset = parse_bytes("chat.db", raw)
        self.assertEqual(dataset.messages[0].text, "😂😂😂 👍🏽")
        self.assertEqual(len(extract_emojis(dataset.messages[0].text)), 4)

    def test_full_chat_database_can_be_previewed_and_filtered(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as handle:
            connection = sqlite3.connect(handle.name)
            connection.executescript("""
                CREATE TABLE handle (id TEXT);
                CREATE TABLE chat (guid TEXT, display_name TEXT, chat_identifier TEXT);
                CREATE TABLE message (text TEXT, handle_id INTEGER, date INTEGER, is_from_me INTEGER);
                CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
            """)
            connection.execute("INSERT INTO handle (id) VALUES ('ava@example.com')")
            connection.execute("INSERT INTO handle (id) VALUES ('ben@example.com')")
            connection.execute("INSERT INTO chat VALUES ('iMessage;+;group-one', 'Friday Group', 'group-one')")
            connection.execute("INSERT INTO chat VALUES ('iMessage;+;group-two', 'Weekend Group', 'group-two')")
            connection.execute("INSERT INTO chat VALUES ('iMessage;+;+15551234567', NULL, '+15551234567')")
            connection.execute("INSERT INTO message VALUES ('Friday hello', 1, 1767225600000000000, 0)")
            connection.execute("INSERT INTO message VALUES ('Weekend hello', 2, 1767225601000000000, 0)")
            connection.execute("INSERT INTO message VALUES ('Unnamed hello', 1, 1767225602000000000, 0)")
            connection.execute("INSERT INTO chat_message_join VALUES (1, 1)")
            connection.execute("INSERT INTO chat_message_join VALUES (2, 2)")
            connection.execute("INSERT INTO chat_message_join VALUES (3, 3)")
            connection.commit()
            connection.close()
            with open(handle.name, "rb") as sqlite_file:
                raw = sqlite_file.read()
        choices = list_conversations("chat.db", raw)
        self.assertEqual([choice["title"] for choice in choices], ["Friday Group", "Weekend Group", "+15551234567"])
        self.assertEqual([choice["is_named"] for choice in choices], [True, True, False])
        self.assertEqual(choices[0]["participant_names"], ["ava@example.com"])
        dataset = parse_bytes("chat.db", raw, conversation_id=choices[1]["conversation_id"])
        self.assertEqual(dataset.conversation.title, "Weekend Group")
        self.assertEqual(dataset.messages[0].text, "Weekend hello")


if __name__ == "__main__":
    unittest.main()
