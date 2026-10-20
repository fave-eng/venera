# Venera · English Space

A completely new student site based on **Kristina(7).zip**, preserving Kristina's styles, all page types, the original interactive `app.js` engine, cloud progress plumbing and GitHub/Supabase directory layout. The student has **no published homework, grammar topics or vocabulary at launch**.

- Student: Venera (Венера), `student_id = venera`
- Student level: A1
- Textbook: English File B1 (as specified)
- New Telegram destination: `https://t.me/c/4440965188/5` (chat `-1004440965188`, topic `5`)
- Existing Supabase project: `zqzgarvmpqqqaobeicpc`

## Directory map

- `index.html`, `homework.html`, `lesson.html`, `grammar.html`, `grammar-topic.html`, `vocabulary.html`, `vocabulary-hub.html`: all original website page types, working with empty-state messages today.
- `app.js`, `styles.css`, `config.js`: original rendering engine and visual style, scoped to Venera.
- `data/lessons/`: contains only an unassigned neutral draft `lesson-template.json` (not published). The first real assignment will be `lesson-1.json`. No Kristina assignments included.
- `data/vocabulary-data.js`, `data/grammar-data.js`: valid empty `window.* = []` catalogues.
- `templates/`: neutral examples for future materials, not published.
- `images/`, `audio/`: empty asset directories ready for new materials.
- `.github/workflows/`: manual material/Telegram workflows with **Venera-only** destination.
- `scripts/`: GitHub Actions notification scripts; requires a server-side secret, never in the web bundle.
- `supabase/`: SQL and **separate** Edge Function, with no changes to Kristina's backend.
- `diagnostics.html`, `diagnostics.js`, `telegram-report-test.html`: service pages scoped to Venera, no hidden homework test records.
- `tests/`: local site integrity checks.

## Publishing

Publish the files in this archive in a **new repository/site for Venera**, preserving folder names. Use HTTPS hosting (e.g. GitHub Pages). Do not upload the archive to Kristina's existing repository.

The top-level `index.html` is the entry page. There is no access code. The same student ID is used to separate future progress rows in Supabase. Browser storage is also prefixed with `english_space_venera_`.

All public pages show zero progress and empty lists until you add material.

## Publishing the first lesson later

1. Create a valid `data/lessons/lesson-1.json` (the JSON file is intentionally NOT included today). Assign `id: lesson-1`, `number: 1`, `status: available`, and actual exercise `blocks`.
2. Add matching vocabulary/grammar topics to the respective data files only if the lesson has those materials.
3. Optionally set `notification.enabled: true` in the lesson JSON, set `SITE_BASE_URL` and `NOTIFY_WEBHOOK_SECRET` for the Venera repo, and trigger `Actions → 2 - Notify about new Venera homework` specifying `lesson-1`.
4. Future lesson progress uses the shared Supabase database with `student_id=venera`. Existing RLS must allow this student ID; test on the published site.

## Telegram configuration status

- The `telegram_recipients` database row has been created for Venera topic 5. Separate RLS policies for her 4 progress tables were added and checked.
- The dedicated Edge Function was initially deployed and can be read from `supabase/functions/notify-venera-telegram/index.ts`.
- **Sending a real Telegram message has not been verified**. The function requires an enabled bot token and a matching `NOTIFY_WEBHOOK_SECRET` (on the Edge Function and the GitHub Actions repo). Use `diagnostics.html` for non-sending checks, then `Actions → Venera · Telegram notification → test` for an actual delivery test.

## Important

`SUPABASE_SERVICE_ROLE_KEY`, `NOTIFY_WEBHOOK_SECRET` and bot tokens must NEVER be placed in front-end files or committed to Git. The Supabase `anonKey` in `config.js` is a public browser key, protected by database Row Level Security, not a secret.

`.git/` in this archive, if present, is a **new and independent local Git history** only, not Kristina's original Git history. `__MACOSX`, `.DS_Store`, original audio, images and homework from Kristina are intentionally excluded.
