# Privacy and retention

The default product mode should parse locally. The current FastAPI demo keeps reports in process memory and has no authentication; it is not production cloud storage.

Before production cloud processing, add authentication, signed uploads, per-job quarantine keys, encryption, no-network workers, size/time limits, no raw-text logging, automatic TTL deletion, deletion verification, rate limiting, and explicit consent. Do not fetch URLs or execute/render uploaded content.
