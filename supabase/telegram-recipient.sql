-- Already registered in the shared Supabase project on 2026-10-20.
-- Only re-run when restoring the setup to the same project.
insert into public.telegram_recipients (student_id, chat_id, message_thread_id, enabled)
values ('venera', -1004440965188, 5, true)
on conflict (student_id) do update
set chat_id = excluded.chat_id,
    message_thread_id = excluded.message_thread_id,
    enabled = excluded.enabled,
    updated_at = now();
