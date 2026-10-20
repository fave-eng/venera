import { createClient } from 'npm:@supabase/supabase-js@2'

const VERSION = 'venera-diagnostics-v3';
const STUDENT = 'venera';
const CHAT_ID = -1004440965188;
const THREAD_ID = 5;
const PREFIX = '__diag_venera__';
const TABLES = {
  homework: { table: 'homework_progress', id: 'lesson_id' },
  grammar: { table: 'grammar_progress', id: 'topic_id' },
  vocabulary: { table: 'vocabulary_progress', id: 'word_key' },
  vocabularyTopics: { table: 'vocabulary_topic_progress', id: 'topic_id' }
} as const;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store'
};
const respond = (body: Record<string, unknown>, status = 200) =>
  Response.json({ ...body, version: VERSION }, { status, headers });
function equal(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function publicKeys(): string[] {
  const keys = [Deno.env.get('SUPABASE_ANON_KEY') || ''];
  try {
    const values = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    keys.push(...Object.values(values).filter((v): v is string => typeof v === 'string'));
  } catch {}
  return keys.filter(Boolean);
}
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try { return String(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || ''); }
  catch { return ''; }
}
function isValidProbe(value: unknown): value is string {
  return typeof value === 'string' &&
    /^__diag_venera__[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}
async function telegramGet(token: string, method: string, params: Record<string, string> = {}) {
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is missing' };
  const target = new URL('https://api.telegram.org/bot' + token + '/' + method);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(6000) });
    const data = await response.json().catch(() => null);
    return response.ok && data?.ok
      ? { ok: true, username: method === 'getMe' ? String(data.result?.username || '') : '',
          type: method === 'getChat' ? String(data.result?.type || '') : '' }
      : { ok: false, error: String(data?.description || 'Telegram API failed').slice(0, 160) };
  } catch { return { ok: false, error: 'Telegram API unreachable' }; }
}
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'POST')
    return respond({ ok: false, error: 'Unsupported HTTP method' }, 405);
  const apikey = request.headers.get('apikey') || '';
  if (!publicKeys().some(key => equal(apikey, key)))
    return respond({ ok: false, error: 'Public Supabase API key rejected' }, 401);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = serviceKey();
  if (!url || !key) return respond({ ok: false, error: 'Supabase credentials missing' }, 503);
  const db = createClient(url, key, { auth: { persistSession: false } });
  if (request.method === 'POST') {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return respond({ ok: false, error: 'Invalid JSON' }, 400); }
    if (body.action !== 'cleanup' || body.studentId !== STUDENT || !isValidProbe(body.probeId))
      return respond({ ok: false, error: 'Invalid cleanup request' }, 400);
    if (typeof body.section !== 'string' || !(body.section in TABLES))
      return respond({ ok: false, error: 'Unknown section' }, 400);
    const def = TABLES[body.section as keyof typeof TABLES];
    // Only random test records with a strict diagnostic UUID prefix can ever be removed.
    const { error } = await db.from(def.table).delete()
      .eq('student_id', STUDENT).eq(def.id, body.probeId);
    if (error) return respond({ ok: false, error: 'Cleanup failed: ' + error.message }, 500);
    const check = await db.from(def.table).select(def.id)
      .eq('student_id', STUDENT).eq(def.id, body.probeId).maybeSingle();
    if (check.error || check.data) return respond({ ok: false, error: 'Cleanup not confirmed' }, 500);
    return respond({ ok: true, cleaned: true, section: body.section });
  }
  const database: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(TABLES)) {
    const { data, error } = await db.from(def.table).select(def.id).eq('student_id', STUDENT).limit(500);
    database[name] = error
      ? { ok: false, error: error.message }
      : { ok: true, visibleRows: (data || []).filter(row => !String(row[def.id] || '').startsWith(PREFIX)).length,
          countTruncated: (data || []).length >= 500 };
  }
  const { data: recipient, error: recipientError } = await db.from('telegram_recipients')
    .select('chat_id,message_thread_id,enabled').eq('student_id', STUDENT).maybeSingle();
  const recipientOk = !recipientError && Boolean(recipient?.enabled) &&
    Number(recipient?.chat_id) === CHAT_ID && Number(recipient?.message_thread_id) === THREAD_ID;
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  const [bot, chat] = await Promise.all([
    telegramGet(token, 'getMe'),
    telegramGet(token, 'getChat', { chat_id: String(CHAT_ID) })
  ]);
  return respond({
    ok: true, studentId: STUDENT, checkedAt: new Date().toISOString(),
    database,
    recipient: { ok: recipientOk, enabled: Boolean(recipient?.enabled),
      threadId: recipient?.message_thread_id ?? null, expectedThreadId: THREAD_ID,
      error: recipientError?.message || (!recipientOk ? 'Recipient or thread mismatch' : '') },
    telegram: { bot, chat, webhookConfigured: Boolean(Deno.env.get('NOTIFY_WEBHOOK_SECRET')) },
    note: 'Bot getMe and getChat do not send a message or confirm forum-topic delivery.'
  });
});