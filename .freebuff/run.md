# Run Doc — Chat Stats Preview

## Reproduce uncommitted artifacts

This project requires no build artifacts to be reproduced. The `.env.local` file already exists in the `apps/web/` directory.

If starting from a fresh checkout:
1. Copy `.env.local` from the main checkout to `apps/web/.env.local`
2. Install dependencies: `cd apps/web && npm install`

## Run the dev server

```bash
cd apps/web
npm run dev
```

The server runs on port 3000 by default.
