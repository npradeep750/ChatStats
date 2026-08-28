# Supabase and Google sign-in setup

The polished frontend supports two history modes:

- Without Supabase: the last 20 reports are saved in the current browser only.
- With Supabase and Google sign-in: each user gets a private report history that works across browsers and devices.

The database stores aggregate report JSON, not the uploaded raw file or raw message text.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/) and create an account.
2. Click **New project**.
3. Choose an organization, enter a project name, create a strong database password, and select a region.
4. Wait for the project to finish provisioning.
5. In the Supabase dashboard, open **Project Settings → Data API**.
6. Copy the **Project URL** and the **Publishable key**. Do not copy a secret/service-role key into the browser.

## 2. Create the saved-report table

1. Open **SQL Editor** in Supabase.
2. Create a new query.
3. Copy the complete contents of `supabase/schema.sql` into the editor.
4. Click **Run**.

The schema enables Row Level Security and only permits an authenticated user to read, insert, update, or delete rows whose `user_id` matches their own Supabase Auth user. Saved reports contain compact aggregate analytics; large per-message reaction evidence is kept out of saved history so large chats do not hit Supabase statement timeouts.

If the table already exists, rerun the complete `supabase/schema.sql` file after pulling code updates. The `grant update` statement and update policy are needed when saving participant names.

## 3. Enable Google sign-in

1. In Supabase, open **Authentication → Providers → Google**.
2. Leave the Supabase Google provider page open so you can copy its **Callback URL**.
3. Open [Google Cloud Console](https://console.cloud.google.com/), create or select a project, and open **APIs & Services → OAuth consent screen**.
4. Configure the consent screen. For local testing, an External app in testing mode is sufficient; add your own Google account as a test user.
5. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
6. Choose **Web application**.
7. Add `http://localhost:3000` and `http://127.0.0.1:3000` as authorized JavaScript origins.
8. Add the exact Supabase Callback URL from step 2 as an authorized redirect URI. It normally looks like `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
9. Copy the Google Client ID and Client Secret into Supabase’s Google provider form and click **Save**.

Supabase handles the Google exchange, then redirects the browser to this app’s `/auth/callback` route, which exchanges the authorization code for a session.

## 4. Configure the frontend

From the repository root:

```bash
cd apps/web
cp .env.example .env.local
```

Open `apps/web/.env.local` and replace the placeholders:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable or in frontend code.

## 5. Add local redirect URLs

In Supabase, open **Authentication → URL Configuration** and set:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`
- Optional second redirect URL: `http://127.0.0.1:3000/auth/callback`

## 6. Run the app

Terminal 1, from the repository root:

```bash
source .venv/bin/activate
uvicorn apps.api.app.main:app --reload
```

Terminal 2:

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Continue with Google**, and authorize the app. After signing in, newly analyzed chats appear in the sidebar and are stored in your own Supabase history.

## 7. Troubleshoot large-chat saves

If an older version displayed the analysis but showed `canceling statement due to statement timeout`, the analysis completed but Supabase rejected the oversized saved JSON. Pull the updated code, rerun `supabase/schema.sql` in the SQL Editor, restart both local servers, and analyze the chat again. The new version saves the summary and leaderboards without per-message reaction evidence and does not request the large JSON back from Supabase after insertion.

## 8. Production checklist

Before deploying, replace the in-memory FastAPI report store with authenticated server-side processing, use short-lived encrypted upload storage, configure the production site and callback URLs, and verify the RLS policies with two separate test accounts.
