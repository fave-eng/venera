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
assert.equal(load('data/vocabulary-data.js').VOCABULARY_DATA.length, 0)
assert.equal(load('data/grammar-data.js').GRAMMAR_DATA.length, 0)
const folders = ['data/lessons', 'images', 'audio', 'scripts', 'templates', '.github/workflows', 'supabase/functions/notify-venera-telegram']
for (const folder of folders) assert(fs.statSync(path.join(root, folder)).isDirectory(), `Missing directory: ${folder}`)
const lessonFiles = fs.readdirSync(path.join(root, 'data/lessons')).filter(s => /^lesson-\d+\.json$/.test(s))
assert.equal(lessonFiles.length, 0, 'A new student must not have existing homework')
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
console.log(`PASS Venera site integrity: ${pages.length} pages, ${folders.length} major directories, empty lesson/vocab/grammar catalogs`)
