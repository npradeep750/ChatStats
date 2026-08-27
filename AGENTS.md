# AGENTS.md

## Repo layout

- `processing/chat_processing/` — core Python library (parsers, analytics, models, pipeline)
- `apps/api/` — FastAPI upload/analysis server (`apps/api/app/main.py`)
- `apps/web/` — Next.js 15 dashboard client (React 19, Supabase auth, Recharts)
- `data/fixtures/` — sample inputs for manual testing
- `supabase/schema.sql` — Supabase table + RLS policies (run in SQL Editor)

## Running things

```bash
# CLI analysis (fastest way to test the pipeline end-to-end)
python3 -m processing.chat_processing.cli data/fixtures/demo.json --timezone Asia/Kolkata

# API server (serves dashboard at /, accepts uploads)
uvicorn apps.api.app.main:app --reload

# Web client (connects to API on localhost:8000)
cd apps/web && npm run dev

# Tests (unittest, not pytest — no test runner config beyond pytest in devDeps)
python3 -m unittest discover -s tests -v
```

## Environment

- Python 3.11+ required
- `CHAT_MAX_UPLOAD_MB` env var controls API upload limit (default 1024 MB)
- Web client needs `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `apps/web/.env.local` (see `.env.example`)
- No linter, formatter, or type checker is configured. No CI pipelines exist.
- `.gitignore` excludes all `.env*` files — never commit secrets

## Architecture notes

- Format detection is file-extension-based with a bytes-sniff fallback (see `pipeline.py:detect_format`)
- iMessage SQLite files can contain multiple conversations; use `/v1/imports/preview` to list them, then pass `conversation_id` to filter
- API stores reports in-memory (`REPORTS` dict) — lost on restart, acceptable for MVP
- All analytics run on the canonical `CanonicalDataset` dataclass (`processing/chat_processing/models.py`); new metrics should consume this, not raw parser output
- The web client is a single `page.tsx` (~1400 lines) — no component splitting yet
