# Supabase for Venera

Shared project: `zqzgarvmpqqqaobeicpc`. Student ID: `venera`.

Recipient was registered in `public.telegram_recipients` with chat ID `-1004440965188` and message thread ID `5`.

The site uses isolated progress rows by `student_id`, and the **dedicated** `notify-venera-telegram` Edge Function.

**Never deploy `notify-telegram` from Kristina's archive.** It is hard-coded for Kristina and topic 39 and may break other student notifications.

Before sending messages using Actions, add `NOTIFY_WEBHOOK_SECRET` to the Venera GitHub repository secrets. The corresponding secret must exist in the shared Supabase project. Do not put the secret into front-end files. Also set repository variable `SITE_BASE_URL` to the published Venera site URL.

Use `telegram-recipient.sql` only if the recipient needs to be recreated. Re-running it changes only the `venera` row.
