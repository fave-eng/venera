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
assert.equal(load('data/vocabulary-data.js').VOCABULARY_DATA.length, 2)
assert.equal(load('data/grammar-data.js').GRAMMAR_DATA.length, 2)
const folders = ['data/lessons', 'images', 'audio', 'scripts', 'templates', '.github/workflows', 'supabase/functions/notify-venera-telegram']
for (const folder of folders) assert(fs.statSync(path.join(root, folder)).isDirectory(), `Missing directory: ${folder}`)
const lessonFiles = fs.readdirSync(path.join(root, 'data/lessons')).filter(s => /^lesson-\d+\.json$/.test(s))
assert.deepEqual(lessonFiles, ['lesson-1.json', 'lesson-2.json', 'lesson-3.json'], 'Expected Homework 1–3')
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
assert.deepEqual(blocks.map(block => block.id), ['food-1c','pronunciation-2c','grammar-3a','grammar-3b','grammar-3c','grammar-3d','grammar-3e'])
const items = blocks.flatMap(block => block.items || [])
assert.equal(items.filter(item => !item.example && !item.displayOnly && item.scored !== false).length, lesson.totalPoints)
assert.equal(lesson.totalPoints, 41)
assert.equal(lesson.notification.enabled, false, 'Never auto-send Telegram notification')
const photos = blocks[0].items.filter(x => x.image).map(x => x.image)
assert.equal(photos.length, 6, 'Keep all six original food photographs')
assert.equal(new Set(photos).size, 6, 'Food pictures must not be duplicated')
assert(!blocks[1].audio, 'Pronunciation 2c is a spelling task, not an audio task')
assert.equal(blocks[1].items.filter(item => !item.example).length, 8, 'Pronunciation 2c requires eight typed words')
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
console.log(`PASS: ${pages.length} pages, Homework 1 with 7 workbook exercises and 41 checked answers, ${vocab.words.length} words, grammar 4 x 4`)


const lesson2 = JSON.parse(read('data/lessons/lesson-2.json'))
const blocks2 = lesson2.blocks.filter(block => block.type === 'exercise')
assert.equal(blocks2.length, 7, 'HW2 must have exactly seven exercises')
assert.deepEqual(blocks2.map(x => x.id), ['family-1a','personality-1b','personality-1d','personality-1e','future-2a','future-2b','future-2c'])
assert.equal(lesson2.totalPoints, blocks2.flatMap(b => b.items).filter(i => !i.example && !i.displayOnly && i.scored !== false).length)
assert.equal(lesson2.notification.enabled,false,'HW2 Telegram must remain manual')
assert.equal(blocks2[5].dialogueGroups.length,5)
for (const g of blocks2[5].dialogueGroups) assert(fs.existsSync(path.join(root,g.image)))
for (const bl of blocks2) for (const i of bl.items) if (i.input === 'gaps') assert.equal(i.segments.length,i.answers.length+1)
assert(load('data/vocabulary-data.js').VOCABULARY_DATA.some(t=>t.id===lesson2.vocabularyId))
const grammar2=load('data/grammar-data.js').GRAMMAR_DATA.find(t=>t.id===lesson2.grammarIds[0])
assert(grammar2 && grammar2.exercises.length===4 && grammar2.exercises.every(e=>e.items.length===4))
assert(app.includes('renderDialogueGroups'), 'Grouped workbook dialogues missing')
console.log(`PASS HW2: 7 exercises, ${lesson2.totalPoints} scored items, 5 dialogues and Grammar 4 x 4`)

// Homework 3 is a revision of unused exercises from Units 1A and 1B.
const lesson3 = JSON.parse(read('data/lessons/lesson-3.json'))
const exercises3 = lesson3.blocks.filter(block => block.type === 'exercise')
assert.equal(lesson3.id, 'lesson-3')
assert.equal(exercises3.length, 7, 'HW3 needs exactly seven unused workbook exercises')
assert.deepEqual(exercises3.map(block => block.id), [
  'revision-1a-food-categories', 'revision-1b-food-definitions', 'revision-1d-food-adjectives',
  'revision-1e-phrasal-verbs', 'revision-1g-listening-vocabulary', 'revision-2a-vowel-chart', 'revision-1c-crossword'
])
const usedOriginal = new Set([...blocks, ...blocks2].map(x => x.id))
for (const block of exercises3) assert(!usedOriginal.has(block.id), `HW3 overlaps previous exercise ${block.id}`)
assert.deepEqual(exercises3.flatMap(block => (block.items || []).filter(item => !item.example && item.scored !== false)).length +
  exercises3.flatMap(block => (block.entries || []).filter(e => !e.example)).length +
  exercises3.flatMap(block => (block.layout === 'ed-pronunciation' ? (block.columns || []).flatMap(c => c.answers || []) : [])).length, lesson3.totalPoints)
assert.equal(lesson3.totalPoints, 50)
assert.equal(lesson3.notification.enabled, false, 'No automatic notification')
assert.equal(exercises3[6].layout, 'crossword-grid')
const entries3 = exercises3[6].entries
assert.equal(entries3.length, 10)
assert.equal(entries3.filter(x => x.example).length, 1)
const crosswordCells = new Map()
for (const entry of entries3) {
  for (let i = 0; i < entry.answer.length; i++) {
    const key = [entry.row + (entry.direction === 'down' ? i : 0), entry.col + (entry.direction === 'across' ? i : 0)].join(':')
    const letter = entry.answer[i].toLowerCase()
    assert(!crosswordCells.has(key) || crosswordCells.get(key) === letter, `Inconsistent crossword overlap: ${key}`)
    crosswordCells.set(key, letter)
  }
}
for (const block of exercises3) for (const item of block.items) if (item.input === 'gaps') assert.equal(item.segments.length, item.answers.length + 1)
assert(!exercises3.some(b => b.audio), 'HW3 has no fake MP3 link')
console.log(`PASS HW3: seven original unused exercises, ${lesson3.totalPoints} scored items, 9 playable crossword words, no audio files required`)
