import { createClient } from 'npm:@supabase/supabase-js@2'

const STUDENT_ID = 'venera'
const EXPECTED_CHAT_ID = -1004440965188
const EXPECTED_TOPIC_ID = 5
const VERSION = 'venera-telegram-v2'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-notify-secret, apikey, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function respond(data: Record<string, unknown>, status = 200): Response {
  return Response.json({ ...data, version: VERSION }, { status, headers: cors })
}
function clean(value: unknown, limit = 250): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}
function html(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (legacy) return legacy
  try {
    const parsed = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    return String(parsed.default || '')
  } catch { return '' }
}
async function configuration() {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = serviceKey()
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
  const webhookSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET') || ''
  if (!url || !key) throw Error('Supabase server credentials are missing')
  const supabase = createClient(url, key)
  const { data, error } = await supabase.from('telegram_recipients')
    .select('chat_id,message_thread_id,enabled').eq('student_id', STUDENT_ID).maybeSingle()
  if (error) throw Error('Could not read Telegram recipient')
  const recipientOk = Boolean(data?.enabled) && Number(data.chat_id) === EXPECTED_CHAT_ID
    && Number(data.message_thread_id) === EXPECTED_TOPIC_ID
  return { recipientOk, botConfigured: Boolean(token), secretConfigured: Boolean(webhookSecret),
    token, webhookSecret, admin: supabase }
}
function secureEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function publicKeyAuthorized(request: Request): boolean {
  const provided = (request.headers.get('apikey') || '').trim()
  if (!provided) return false
  const publicKeys = [Deno.env.get('SUPABASE_ANON_KEY') || '']
  try {
    const parsed = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    publicKeys.push(...Object.values(parsed).filter((item): item is string => typeof item === 'string'))
  } catch { /* legacy key is supported */ }
  return publicKeys.some(key => secureEqual(key, provided))
}

async function handleHomeworkReport(request: Request, payload: Record<string, unknown>, settings: Awaited<ReturnType<typeof configuration>>): Promise<Response> {
  if (!publicKeyAuthorized(request)) return respond({ok: false, error: 'Unauthorized homework report'}, 401)
  if (payload.studentId !== STUDENT_ID) return respond({ok: false, error: 'Invalid student ID'}, 403)
  const lessonId = clean(payload.lessonId, 80)
  if (!/^lesson-\d+$/.test(lessonId)) return respond({ok: false, error: 'Invalid lesson ID'}, 400)
  const { data: row, error } = await settings.admin.from('homework_progress').select('*')
    .eq('student_id', STUDENT_ID).eq('lesson_id', lessonId).maybeSingle()
  if (error || !row) return respond({ok: false, error: 'Homework submission not found in Supabase'}, 404)
  if (row.status !== 'submitted' || Number(row.score_total || 0) <= 0 || !row.submitted_at)
    return respond({ok: false, error: 'Homework has not been submitted'}, 409)
  if (row.report_sent_at && Date.parse(row.report_sent_at) >= Date.parse(row.submitted_at))
    return respond({ok: true, skipped: true, reason: 'already_sent', studentId: STUDENT_ID, topicId: EXPECTED_TOPIC_ID})
  const lessonUrl = clean(payload.lessonUrl, 900)
  if (lessonUrl) {
    try { const url = new URL(lessonUrl); if (!['https:', 'http:'].includes(url.protocol)) throw Error('Bad scheme') }
    catch { return respond({ok: false, error: 'Invalid lesson URL'}, 400) }
  }
  const title = clean(row.lesson_title || lessonId, 150)
  const score = Number(row.score_correct || 0) + '/' + Number(row.score_total || 0)
  const message = ['✅ <b>Homework completed · Venera</b>', '<b>' + html(title) + '</b>', 'Score: ' + html(score),
    lessonUrl ? '<a href="' + html(lessonUrl.replaceAll('"', '&quot;')) + '">Open homework</a>' : ''].filter(Boolean).join('\n')
  const reply = await fetch('https://api.telegram.org/bot' + settings.token + '/sendMessage', {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({chat_id: EXPECTED_CHAT_ID, message_thread_id: EXPECTED_TOPIC_ID,
      text: message, parse_mode: 'HTML', disable_web_page_preview: true})
  })
  const telegram = await reply.json().catch(() => null)
  if (!reply.ok || !telegram?.ok) return respond({ok: false, error: 'Telegram delivery failed'}, 502)
  const { error: updateError } = await settings.admin.from('homework_progress')
    .update({report_status: 'sent', report_sent_at: new Date().toISOString(), status: 'submitted', report_error: null})
    .eq('student_id', STUDENT_ID).eq('lesson_id', lessonId)
  if (updateError) return respond({ok: false, error: 'Message sent but report log could not be saved'}, 503)
  return respond({ok: true, studentId: STUDENT_ID, topicId: EXPECTED_TOPIC_ID,
    telegramMessageId: telegram.result?.message_id || null})
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'GET' && request.method !== 'POST') return respond({ ok: false, error: 'Method not allowed' }, 405)
  try {
    const settings = await configuration()
    if (request.method === 'GET') {
      return respond({ ok: settings.recipientOk && settings.botConfigured && settings.secretConfigured,
        studentId: STUDENT_ID, recipientConfigured: settings.recipientOk,
        botConfigured: settings.botConfigured, webhookConfigured: settings.secretConfigured,
        topicId: EXPECTED_TOPIC_ID }, settings.recipientOk && settings.botConfigured && settings.secretConfigured ? 200 : 503)
    }
    if (!settings.recipientOk || !settings.botConfigured)
      return respond({ ok: false, error: 'Telegram destination is not configured' }, 503)
    let payload: Record<string, unknown>
    try { payload = await request.json() } catch { return respond({ ok: false, error: 'Invalid JSON' }, 400) }
    if (payload.eventType === 'homework_report') return await handleHomeworkReport(request, payload, settings)
    const actual = request.headers.get('x-notify-secret') || ''
    if (!secureEqual(actual, settings.webhookSecret))
      return respond({ ok: false, error: 'Unauthorized' }, 401)
    const action = clean(payload.action, 40)
    const title = clean(payload.title, 150)
    const description = clean(payload.description, 650)
    const link = clean(payload.url, 900)
    if (!['test', 'new_material', 'homework_submitted'].includes(action))
      return respond({ ok: false, error: 'Unsupported action' }, 400)
    if (action !== 'test' && !title)
      return respond({ ok: false, error: 'Title is required' }, 400)
    if (link) {
      try {
        const parsed = new URL(link)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw Error('Bad URL')
      } catch { return respond({ ok: false, error: 'Invalid link' }, 400) }
    }
    const text = action === 'test'
      ? '✅ <b>Venera · English Space</b>\nTelegram notifications are connected. This is a test message.'
      : [action === 'homework_submitted' ? '✅ <b>Homework completed · Venera</b>' : '📚 <b>New material · Venera</b>',
         '', '<b>' + html(title) + '</b>',
         description ? html(description) : '',
         link ? '<a href="' + html(link.replaceAll('"', '&quot;')) + '">Open material</a>' : ''
        ].filter(Boolean).join('\n')
    const response = await fetch('https://api.telegram.org/bot' + settings.token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: EXPECTED_CHAT_ID, message_thread_id: EXPECTED_TOPIC_ID,
        text, parse_mode: 'HTML', disable_web_page_preview: true })
    })
    const sent = await response.json().catch(() => null)
    if (!response.ok || !sent?.ok)
      return respond({ ok: false, error: 'Telegram delivery failed' }, 502)
    return respond({ ok: true, studentId: STUDENT_ID, topicId: EXPECTED_TOPIC_ID,
      telegramMessageId: sent.result?.message_id || null })
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : 'Server error' }, 503)
  }
})
