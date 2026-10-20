import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const load = (relativePath) => {
  const env = {window: {}}
  vm.runInNewContext(read(relativePath), env, {filename: relativePath})
  return env.window
}
const config = load('config.js').APP_CONFIG
assert.equal(config.student.id, 'venera')
assert.equal(config.student.level, 'A1')
assert.equal(config.student.textbook, 'English File')
assert.equal(config.student.textbookEdition, 'B1')
assert.equal(config.supabase.notificationFunction, 'notify-venera-telegram')
assert.equal(load('data/vocabulary-data.js').VOCABULARY_DATA.length, 1)
assert.equal(load('data/grammar-data.js').GRAMMAR_DATA.length, 1)
const folders = ['data/lessons', 'images', 'audio', 'scripts', 'templates', '.github/workflows', 'supabase/functions/notify-venera-telegram']
for (const folder of folders) assert(fs.statSync(path.join(root, folder)).isDirectory(), `Missing directory: ${folder}`)
const lessonFiles = fs.readdirSync(path.join(root, 'data/lessons')).filter(s => /^lesson-\d+\.json$/.test(s))
assert.deepEqual(lessonFiles, ['lesson-1.json'], 'Homework 1 must be the only published lesson')
const pages = ['index.html', 'homework.html', 'lesson.html', 'grammar.html', 'grammar-topic.html', 'vocabulary-hub.html', 'vocabulary.html', 'diagnostics.html','telegram-report-test.html']
for (const page of pages) {
  const html = read(page)
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1])
  for (const ref of urls) {
    if (ref.startsWith('#') || ref.startsWith('http:') || ref.startsWith('https:') || ref.startsWith('data:')) continue
    const pathname = ref.split(/[?#]/)[0]
    assert(fs.existsSync(path.join(root, pathname)), `${page}: missing asset ${pathname}`)
  }
}
const app = read('app.js')
assert(app.includes('notify-venera-telegram'), 'Frontend is not directed to Venera function')
assert(!app.includes("const STUDENT_ID = 'kristina'"), 'Site still belongs to Kristina')
const edge = read('supabase/functions/notify-venera-telegram/index.ts')
assert(edge.includes('EXPECTED_TOPIC_ID = 5'), 'Wrong notification topic')
assert(edge.includes("STUDENT_ID = 'venera'"), 'Wrong notification student')
assert(edge.includes('homework_report'), 'Homework reporting is not wired')

const lesson = JSON.parse(read('data/lessons/lesson-1.json'))
const blocks = lesson.blocks.filter(block => block.type === 'exercise')
assert.equal(blocks.length, 7, 'Exactly seven original workbook exercises must be selected')
assert.deepEqual(blocks.map(block => block.id), ['food-1c','pronunciation-2b','grammar-3a','grammar-3b','grammar-3c','grammar-3d','grammar-3e'])
const items = blocks.flatMap(block => block.items || [])
assert.equal(items.filter(item => !item.example && !item.displayOnly && item.scored !== false).length, lesson.totalPoints)
assert.equal(lesson.totalPoints, 33)
assert.equal(lesson.notification.enabled, false, 'Never auto-send Telegram notification')
const vocab = load('data/vocabulary-data.js').VOCABULARY_DATA[0]
assert.equal(lesson.vocabularyId, vocab.id)
assert(vocab.words.length > 0 && vocab.words.length <= 30)
const grammar = load('data/grammar-data.js').GRAMMAR_DATA[0]
assert.equal(lesson.grammarIds[0], grammar.id)
assert.equal(grammar.exercises.length, 4)
assert(grammar.exercises.every(block => block.items.length === 4))
assert.equal(grammar.lockOnPass, true)
for (const block of blocks) {
  for (const item of block.items) {
    if (item.image) assert(fs.existsSync(path.join(root,item.image)), `Original photo missing: ${item.image}`)
    if (item.input === 'gaps') assert.equal(item.segments.length, item.answers.length + 1, `Broken inline gap: ${block.id} / ${item.id}`)
  }
  if (block.audio && !fs.existsSync(path.join(root,block.audio))) console.warn(`AUDIO MISSING: ${block.audio} — original MP3 must be uploaded separately`)
}
for (const key of ['renderPictureLabelGrid','renderEmailCompose','wireEmailDependencies','lockOnPass']) assert(app.includes(key), `Missing new interface feature: ${key}`)
console.log(`PASS: ${pages.length} pages, Homework 1 with 7 workbook exercises and 33 checked answers, ${vocab.words.length} words, grammar 4 x 4`)

