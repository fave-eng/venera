import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = process.cwd()
const lessonId = process.env.LESSON_ID?.trim() || ''
const base = process.env.SITE_BASE_URL?.trim().replace(/\/+$/, '') || ''
const secret = process.env.NOTIFY_WEBHOOK_SECRET?.trim() || ''
if (!/^lesson-\d+$/.test(lessonId)) throw Error('LESSON_ID must match lesson-N')
if (!base || !/^https:\/\//.test(base)) throw Error('Missing valid SITE_BASE_URL')
if (!secret) throw Error('Missing NOTIFY_WEBHOOK_SECRET')
const lessonPath = path.join(root, 'data', 'lessons', lessonId + '.json')
if (!fs.existsSync(lessonPath)) throw Error('Lesson JSON not found')
const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'))
if (lesson.id !== lessonId || lesson.status !== 'available' || lesson.notification?.enabled !== true)
  throw Error('Lesson is unpublished or notifications are not enabled')

const readArray = (filename, name) => {
  const source = fs.readFileSync(path.join(root, filename), 'utf8')
  const sandbox = { window: {} }
  vm.runInNewContext(source, sandbox, { timeout: 2000 })
  return Array.isArray(sandbox.window[name]) ? sandbox.window[name] : []
}
const vocabulary = readArray('data/vocabulary-data.js', 'VOCABULARY_DATA')
const grammar = readArray('data/grammar-data.js', 'GRAMMAR_DATA')
const vocTopic = vocabulary.find(topic => topic.id === lesson.vocabularyId && (topic.words || []).length)
const gramTopics = grammar.filter(topic => topic.status === 'available'
  && ((lesson.grammarIds || []).includes(topic.id) || topic.linkedLessonId === lessonId))
const detail = [lesson.subtitle || '',
  vocTopic ? `Vocabulary: ${vocTopic.title}` : '',
  ...gramTopics.map(topic => `Grammar: ${topic.title}`)].filter(Boolean).join(' · ')
const payload = {
  action: 'new_material', title: `Homework ${lessonId.split('-')[1]}: ${lesson.title}`,
  description: detail,
  url: new URL(`lesson.html?id=${encodeURIComponent(lessonId)}`, base + '/').toString(),
}
const response = await fetch('https://zqzgarvmpqqqaobeicpc.supabase.co/functions/v1/notify-venera-telegram', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-notify-secret': secret },
  body: JSON.stringify(payload)
})
const result = await response.json().catch(() => ({}))
if (!response.ok || !result.ok) throw Error(`Telegram notification failed: ${result.error || response.status}`)
console.log('Notification delivered to Venera topic, message id', result.telegramMessageId)
