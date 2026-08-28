# Chat Stats

Privacy-first group chat stats for iMessage SQLite, Instagram JSON, and mapped CSV exports.

## Quick start

```bash
python3 -m processing.chat_processing.cli data/fixtures/demo.json --timezone Asia/Kolkata
uvicorn apps.api.app.main:app --reload
```

Then open http://127.0.0.1:8000. Local uploads up to 1 GB are accepted by default; set `CHAT_MAX_UPLOAD_MB` in the API shell to change the limit. For example: `CHAT_MAX_UPLOAD_MB=2048 uvicorn apps.api.app.main:app --reload`. The API keeps uploads in memory for this MVP. Production cloud mode should replace this with quarantined object storage, authentication, background workers, encryption, and TTL deletion.

## Current MVP

- Canonical conversation/message/reaction schema.
- Generic Instagram-style JSON, CSV, and iMessage SQLite parsing.
- Conversation-relative Main Character ranking with equal reaction-type weights.
- Reply attribution and reply-nature classification.
- Double Texter, Novelist, Conversation Starter, Night Owl, Early Bird, Emoji Addict, Media Spammer, Quick-Draw, Ghost, Time Traveler, and Grammar Police metrics.
- FastAPI upload endpoint and a small dashboard client.

See `docs/analytics-definitions.md` for the metric contract and `docs/privacy-and-retention.md` for the security boundary.
