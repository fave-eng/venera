import { createClient } from 'npm:@supabase/supabase-js@2'

const VERSION = 'venera-diagnostics-v4';
const STUDENT = 'venera';
const CHAT_ID = -1004440965188;
const THREAD_ID = 5;
const PREFIX = '__diag_venera__';
const TEST_INTERVAL = 15 * 60 * 1000;
const TEST_TYPE = 'venera_diagnostics_telegram_test';
const TEST_MATERIAL = 'topic-5';
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
  const keys = [Deno.env.get('SUPABASE_ANON_KEY') || '', Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '']
  try {
    const dictionary = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    keys.push(...Object.values(dictionary).filter((v): v is string => typeof v === 'string'))
  } catch { /* legacy keys may be active */ }
  return keys.filter(Boolean)
}
async function authorized(request: Request, url: string): Promise<boolean> {
  const candidate = (request.headers.get('apikey') || '').trim()
  if (!candidate || candidate.length > 1024) return false
  if (publicKeys().some(key => equal(candidate, key))) return true
  if (candidate.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(candidate.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
      if (payload.role !== 'anon' || payload.ref !== new URL(url).hostname.split('.')[0]) return false
    } catch { return false }
  } else if (!candidate.startsWith('sb_publishable_')) return false
  try {
    const target = new URL('/rest/v1/grammar_progress', url)
    target.searchParams.set('select', 'topic_id')
    target.searchParams.set('student_id', 'eq.venera')
    target.searchParams.set('limit', '0')
    const res = await fetch(target, { method: 'GET',
      headers: { apikey: candidate, ...(candidate.startsWith('eyJ') ? { Authorization: 'Bearer ' + candidate } : {}) },
      signal: AbortSignal.timeout(6000) })
    await res.body?.cancel().catch(() => undefined)
    return res.ok
  } catch { return false }
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

type AdminClient = ReturnType<typeof createClient>;
async function sendTest(db: AdminClient) {
  const { data: recipient, error: recipientError } = await db.from('telegram_recipients')
    .select('chat_id,message_thread_id,enabled').eq('student_id', STUDENT).maybeSingle()
  if (recipientError || !recipient?.enabled || Number(recipient.chat_id) !== CHAT_ID || Number(recipient.message_thread_id) !== THREAD_ID)
    return respond({ ok: false, error: 'Telegram получатель или тема №5 настроены неверно' }, 503)
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
  if (!token) return respond({ ok: false, error: 'TELEGRAM_BOT_TOKEN не настроен' }, 503)

  // Fixed destination + message + database-backed cooldown prevent unrestricted public relay.
  const now = Date.now()
  const { data: recent, error: recentError } = await db.from('material_publications')
    .select('created_at').eq('student_id', STUDENT).eq('material_type', TEST_TYPE)
    .eq('material_id', TEST_MATERIAL).gte('created_at', new Date(now - TEST_INTERVAL).toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (recentError) return respond({ ok: false, error: 'Не удалось проверить ограничение отправки' }, 503)
  if (recent) {
    const seconds = Math.max(1, Math.ceil((Date.parse(recent.created_at) + TEST_INTERVAL - now) / 1000))
    return respond({ ok: false, error: 'Тест уже запускался. Повтори через ' + Math.ceil(seconds / 60) + ' мин.',
      retryAfterSeconds: seconds }, 429)
  }
  const { data: publication, error: reserveError } = await db.from('material_publications')
    .insert({ student_id: STUDENT, material_type: TEST_TYPE, material_id: TEST_MATERIAL,
      notification_version: Math.floor(now / TEST_INTERVAL), status: 'pending',
      payload: { diagnostic: true, topic: THREAD_ID } })
    .select('id').single()
  if (reserveError || !publication) {
    if (reserveError?.code === '23505') return respond({ ok: false, error: 'Тест уже запущен. Повтори через 15 минут.' }, 429)
    return respond({ ok: false, error: 'Не удалось зарегистрировать тест отправки' }, 503)
  }
  const message = ['🧪 <b>Проверка Telegram · Венера</b>',
    'Тестовое сообщение из диагностики сайта.', 'Тема №5, отправка работает.'].join('\n')
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, message_thread_id: THREAD_ID,
        text: message, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000)
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.ok)
      throw Error(String(result?.description || ('Telegram HTTP ' + response.status)).slice(0, 160))
    const id = Number(result.result?.message_id || 0)
    if (!id) throw Error('Telegram не вернул message_id')
    const { error: logError } = await db.from('material_publications').update({
      status: 'sent', sent_at: new Date().toISOString(), telegram_message_id: id
    }).eq('id', publication.id)
    return respond({ ok: true, delivered: true, topicId: THREAD_ID, telegramMessageId: id,
      warning: logError ? 'Доставлено, но запись журнала не обновилась' : undefined })
  } catch (error) {
    await db.from('material_publications').update({ status: 'failed',
      error_message: (error instanceof Error ? error.message : String(error)).slice(0, 160) }).eq('id', publication.id)
    return respond({ ok: false, error: 'Telegram отклонил тест: ' + (error instanceof Error ? error.message : 'ошибка подключения') }, 502)
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'POST')
    return respond({ ok: false, error: 'Unsupported HTTP method' }, 405);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = serviceKey();
  if (!url || !key) return respond({ ok: false, error: 'Supabase credentials missing' }, 503);
  if (!await authorized(request, url))
    return respond({ ok: false, error: 'Публичный ключ Supabase отклонён или API недоступен' }, 401);
  const db = createClient(url, key, { auth: { persistSession: false } });
  if (request.method === 'POST') {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return respond({ ok: false, error: 'Invalid JSON' }, 400); }
    if (body.studentId === STUDENT && body.action === 'telegram_test') return await sendTest(db);
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
    note: 'getMe/getChat не отправляют сообщения. Используй отдельную кнопку Telegram-теста.'
  });
});
