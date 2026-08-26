"""Small, read-only decoder for iMessage ``attributedBody`` metadata.

Apple stores modern Messages bodies as legacy ``streamtyped`` archives.  This
module intentionally decodes only the pieces needed by Chat Stats: the visible
string and attribute runs.  In particular, it preserves the native
``__kIMMentionConfirmedMention`` contact address instead of guessing from
ordinary message text.
"""

from __future__ import annotations

from dataclasses import dataclass
import struct
from typing import Any


_TAG_INTEGER_2 = 0x81
_TAG_INTEGER_4 = 0x82
_TAG_FLOAT = 0x83
_TAG_NEW = 0x84
_TAG_NIL = 0x85
_TAG_END = 0x86
_FIRST_TAG = 0x80
_LAST_TAG = 0x91
_FIRST_REF = -110


@dataclass
class _Object:
    kind: str
    value: Any


class _Decoder:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.position = 0
        self.little_endian = False
        self.shared_strings: list[bytes] = []
        self.objects: list[Any] = []

    def read(self, count: int = 1) -> bytes:
        if count < 0 or self.position + count > len(self.data):
            raise ValueError("truncated typedstream")
        result = self.data[self.position : self.position + count]
        self.position += count
        return result

    def head(self) -> int:
        return self.read()[0]

    @staticmethod
    def signed_byte(value: int) -> int:
        return value - 256 if value >= 128 else value

    def integer_from_head(self, head: int, signed: bool) -> int:
        if not (_FIRST_TAG <= head <= _LAST_TAG):
            value = self.signed_byte(head)
            return value if signed else head
        if head == _TAG_INTEGER_2:
            raw = self.read(2)
            return int.from_bytes(raw, "little" if self.little_endian else "big", signed=signed)
        if head == _TAG_INTEGER_4:
            raw = self.read(4)
            return int.from_bytes(raw, "little" if self.little_endian else "big", signed=signed)
        raise ValueError("unsupported typedstream integer")

    def integer(self, signed: bool) -> int:
        return self.integer_from_head(self.head(), signed)

    def shared_string_from_head(self, head: int) -> bytes | None:
        if head == _TAG_NIL:
            return None
        if head == _TAG_NEW:
            length = self.integer_from_head(self.head(), False)
            value = self.read(length)
            self.shared_strings.append(value)
            return value
        index = self.integer_from_head(head, True) - _FIRST_REF
        if index < 0 or index >= len(self.shared_strings):
            raise ValueError("invalid typedstream string reference")
        return self.shared_strings[index]

    def shared_string(self) -> bytes | None:
        return self.shared_string_from_head(self.head())

    def read_class(self) -> str | None:
        head = self.head()
        classes: list[tuple[str, int]] = []
        while head == _TAG_NEW:
            name = self.shared_string()
            if name is None:
                raise ValueError("missing typedstream class name")
            classes.append((name.decode("utf-8", errors="replace"), self.integer(True)))
            head = self.head()
        if head != _TAG_NIL:
            index = self.integer_from_head(head, True) - _FIRST_REF
            if index < 0 or index >= len(self.objects) or not isinstance(self.objects[index], str):
                raise ValueError("invalid typedstream class reference")
            if not classes:
                classes.append((self.objects[index], 0))
        for name, _ in classes:
            self.objects.append(name)
        return classes[0][0] if classes else None

    def read_values(self) -> tuple[str, list[Any]]:
        encoding_bytes = self.shared_string()
        if encoding_bytes is None:
            raise ValueError("missing typedstream encoding")
        encoding = encoding_bytes.decode("ascii", errors="replace")
        encodings = self.split_encodings(encoding)
        return encoding, [self.read_value(item) for item in encodings]

    def read_value(self, encoding: str) -> Any:
        if encoding in {"C", "c"}:
            value = self.read()[0]
            return value if encoding == "C" else self.signed_byte(value)
        if encoding in {"S", "I", "L", "Q", "s", "i", "l", "q"}:
            return self.integer(encoding.islower())
        if encoding in {"f", "d"}:
            size = 4 if encoding == "f" else 8
            raw = self.read(size)
            return struct.unpack(("<" if self.little_endian else ">") + encoding, raw)[0]
        if encoding == "+":
            head = self.head()
            if head == _TAG_NIL:
                return None
            length = self.integer_from_head(head, False)
            return self.read(length).decode("utf-8", errors="replace")
        if encoding in {"*", "%", ":"}:
            value = self.shared_string()
            return value.decode("utf-8", errors="replace") if value is not None else None
        if encoding == "#":
            return self.read_class()
        if encoding == "@":
            return self.read_object()
        if encoding == "!":
            return None
        if encoding.startswith("["):
            end = encoding.find("]")
            if end <= 1:
                raise ValueError("unsupported typedstream array")
            length = int(encoding[1:end])
            element_encoding = encoding[end + 1 :]
            if element_encoding in {"c", "C"}:
                return self.read(length)
            return [self.read_value(element_encoding) for _ in range(length)]
        if encoding.startswith("{"):
            # Structs are not needed for mention metadata, but consume their
            # fields so the enclosing archive remains aligned.
            inner = encoding[1:-1]
            fields = inner.split("=", 1)[-1]
            return [self.read_value(item) for item in self.split_encodings(fields)]
        raise ValueError(f"unsupported typedstream encoding {encoding!r}")

    def read_object(self) -> Any:
        head = self.head()
        if head == _TAG_NIL:
            return None
        if head != _TAG_NEW:
            index = self.integer_from_head(head, True) - _FIRST_REF
            if index < 0 or index >= len(self.objects):
                raise ValueError("invalid typedstream object reference")
            return self.objects[index]

        index = len(self.objects)
        self.objects.append(None)
        class_name = self.read_class()
        if class_name in {"NSString", "NSMutableString"}:
            value = _Object("string", self.read_values()[1][0])
        elif class_name in {"NSAttributedString", "NSMutableAttributedString"}:
            value = self.read_attributed_string()
        elif class_name in {"NSDictionary", "NSMutableDictionary"}:
            count = int(self.read_values()[1][0])
            pairs = []
            for _ in range(max(0, count)):
                pairs.append((self.read_values()[1][0], self.read_values()[1][0]))
            value = _Object("dictionary", pairs)
        elif class_name in {"NSNumber", "NSValue"}:
            # NSNumber stores a type encoding followed by the encoded value.
            type_encoding = self.read_values()[1][0]
            value = _Object("number", self.read_value(str(type_encoding)))
        elif class_name == "NSObject":
            value = _Object("generic", None)
        else:
            value = self.skip_generic_object()
        self.objects[index] = value
        if self.head() != _TAG_END:
            raise ValueError("invalid typedstream object terminator")
        return value

    def read_attributed_string(self) -> _Object:
        string_value = self.read_values()[1][0]
        if not isinstance(string_value, _Object) or string_value.kind != "string":
            raise ValueError("attributed string has no NSString")
        text = str(string_value.value or "")
        text_length = len(text.encode("utf-16-le")) // 2
        runs: list[dict[str, Any]] = []
        shared_attributes: dict[int, dict[str, Any]] = {}
        offset = 0
        while offset < text_length:
            values = self.read_values()[1]
            if len(values) < 2:
                raise ValueError("invalid attributed string range")
            reference = int(values[0])
            length = int(values[1])
            if reference not in shared_attributes:
                dictionary = self.read_values()[1][0]
                shared_attributes[reference] = self.dictionary_values(dictionary)
            runs.append({"offset": offset, "length": length, "attributes": shared_attributes[reference]})
            offset += max(0, length)
        return _Object("attributed_string", {"text": text, "runs": runs})

    @staticmethod
    def dictionary_values(value: Any) -> dict[str, Any]:
        if not isinstance(value, _Object) or value.kind != "dictionary":
            return {}
        result: dict[str, Any] = {}
        for key, item in value.value:
            if isinstance(key, _Object) and key.kind == "string":
                result[str(key.value)] = item
            elif isinstance(key, str):
                result[key] = item
        return result

    def skip_generic_object(self) -> _Object:
        # Unknown Foundation objects are uncommon in message runs. Consume
        # their typed fields conservatively while retaining no raw user data.
        while True:
            head = self.head()
            if head == _TAG_END:
                self.position -= 1
                return _Object("generic", None)
            encoding_bytes = self.shared_string_from_head(head)
            if encoding_bytes is None:
                raise ValueError("invalid generic typedstream field")
            for encoding in self.split_encodings(encoding_bytes.decode("ascii", errors="replace")):
                self.read_value(encoding)

    @staticmethod
    def split_encodings(value: str) -> list[str]:
        result: list[str] = []
        index = 0
        while index < len(value):
            if value[index] in "[{(":
                opening = value[index]
                closing = {"[": "]", "{": "}", "(": ")"}[opening]
                depth = 1
                end = index + 1
                while end < len(value) and depth:
                    if value[end] == opening:
                        depth += 1
                    elif value[end] == closing:
                        depth -= 1
                    end += 1
                result.append(value[index:end])
                index = end
            else:
                result.append(value[index])
                index += 1
        return result

    def decode(self) -> _Object | None:
        if self.integer(False) != 4 or self.integer(False) != 11 or self.read(11) not in {b"typedstream", b"streamtyped"}:
            raise ValueError("not an iMessage typedstream")
        self.little_endian = self.data[2:13] == b"streamtyped"
        self.integer(False)
        result = None
        while self.position < len(self.data):
            try:
                values = self.read_values()[1]
            except (IndexError, ValueError):
                break
            if values and isinstance(values[0], _Object) and values[0].kind == "attributed_string":
                result = values[0]
                break
        return result


def _string_value(value: Any) -> str | None:
    if isinstance(value, _Object) and value.kind == "string":
        return str(value.value)
    if isinstance(value, str):
        return value
    return None


def _utf16_slice(text: str, start: int, length: int) -> str:
    encoded = text.encode("utf-16-le")
    return encoded[start * 2 : (start + length) * 2].decode("utf-16-le", errors="ignore")


def decode_mentions(blob: bytes | bytearray | memoryview | None, visible_text: str) -> list[dict[str, Any]]:
    """Return native mention ranges from one attributedBody blob.

    The fast marker check avoids decoding almost every ordinary message. A
    failure returns an empty list so a corrupt/unsupported body never prevents
    the rest of a chat from being analyzed.
    """
    if not blob:
        return []
    raw = bytes(blob)
    marker = b"__kIMMentionConfirmedMention"
    if marker not in raw:
        return []
    try:
        attributed = _Decoder(raw).decode()
    except (IndexError, UnicodeError, ValueError, struct.error):  # type: ignore[name-defined]
        return []
    if not attributed or attributed.kind != "attributed_string":
        return []
    mentions = []
    for run in attributed.value.get("runs", []):
        attributes = run.get("attributes", {})
        target = _string_value(attributes.get("__kIMMentionConfirmedMention"))
        if not target:
            continue
        label = _utf16_slice(visible_text, int(run["offset"]), int(run["length"])).strip()
        if label:
            mentions.append({"target": target, "text": label, "range": [int(run["offset"]), int(run["length"])]})
    return mentions
