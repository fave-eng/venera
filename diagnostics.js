(() => {
  'use strict';

  const VERSION = 'venera-diagnostics-v3';
  const STUDENT_ID = 'venera';
  const EXPECTED_TOPIC = 5;
  const PREFIX = '__diag_venera__';
  const config = window.APP_CONFIG || {};
  const definitions = [
    { section: 'homework', tableKey: 'homework', defaultTable: 'homework_progress', id: 'lesson_id', label: 'Домашние задания',
      create: id => ({ student_id: STUDENT_ID, lesson_id: id, student_name: 'Diagnostics', lesson_title: 'Temporary diagnostics record', status: 'draft', answers: { diagnostic: 'created' }, report_status: 'not_sent' }),
      update: () => ({ answers: { diagnostic: 'updated' }, updated_at: new Date().toISOString() }),
      validate: row => row.status === 'draft' && row.answers?.diagnostic === 'updated' },
    { section: 'grammar', tableKey: 'grammar', defaultTable: 'grammar_progress', id: 'topic_id', label: 'Грамматика',
      create: id => ({ student_id: STUDENT_ID, topic_id: id, attempts: 1, best_score: 0, passed: false, answers: { test: 'initial' } }),
      update: () => ({ attempts: 2, best_score: 100, passed: true, passed_at: new Date().toISOString(), answers: { test: 'updated' } }),
      validate: row => row.attempts === 2 && row.best_score === 100 && row.passed === true && row.answers?.test === 'updated' },
    { section: 'vocabulary', tableKey: 'vocabulary', defaultTable: 'vocabulary_progress', id: 'word_key', label: 'Словарь · слова',
      create: id => ({ student_id: STUDENT_ID, word_key: id, word_id: id, en: 'test word', ru: 'тест', status: 'difficult' }),
      update: () => ({ status: 'known', learned_at: new Date().toISOString() }),
      validate: row => row.status === 'known' && Boolean(row.learned_at) },
    { section: 'vocabularyTopics', tableKey: 'vocabularyTopics', defaultTable: 'vocabulary_topic_progress', id: 'topic_id', label: 'Словарь · тесты и темы',
      create: id => ({ student_id: STUDENT_ID, topic_id: id, tests: [] }),
      update: () => ({ tests: [{ score: 100, diagnostic: true }] }),
      validate: row => Array.isArray(row.tests) && row.tests.length === 1 && row.tests[0]?.score === 100 },
  ];
  const $ = selector => document.querySelector(selector);
  const checksEl = $('#checks');
  const summaryEl = $('#main-summary');
  const reportEl = $('#raw-output');
  const dbResultEl = $('#db-write-result');
  const runBtn = $('#run-all');
  const writeBtn = $('#test-db-write');
  const cfgEl = $('#config-info');
  const tgEl = $('#telegram-info');
  let client;
  let busy = false;
  let report = { version: VERSION, startedAt: null, checks: [], writeProbes: {}, errors: [] };

  const stringify = value => String(value ?? '');
  function domText(tag, className, message) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = stringify(message);
    return element;
  }
  function addKV(target, key, value) {
    const wrap = domText('div', 'kv', '');
    wrap.append(domText('span', '', key), domText('strong', '', value));
    target.append(wrap);
  }
  function addCheck(name, status, detail = '') {
    const item = domText('div', `check ${status}`, '');
    item.append(domText('div', 'ico', status === 'ok' ? '✓' : status === 'bad' ? '!' : 'i'));
    const content = domText('div', '', '');
    content.append(domText('div', 'name', name), domText('div', 'detail', detail));
    item.append(content);
    checksEl.append(item);
    report.checks.push({ name, status, detail });
    showReport();
  }
  function showReport() { reportEl.textContent = JSON.stringify(report, null, 2); }
  function setSummary(status, message) { summaryEl.className = `summary ${status}`; summaryEl.textContent = message; }
  function describe(err) {
    if (!err) return 'Неизвестная ошибка';
    const text = stringify(err.message || err.error || err);
    if (/row-level security|permission denied|42501/i.test(text)) return `${text} · Проверь RLS для venera`;
    if (/failed to fetch|networkerror|load failed/i.test(text)) return `${text} · Проверь соединение, адрес Supabase и CORS`;
    return text.slice(0, 320);
  }
  function reset() {
    checksEl.replaceChildren(); tgEl.replaceChildren();
    report = { version: VERSION, startedAt: new Date().toISOString(), checks: [], writeProbes: {}, errors: [] };
    showReport();
  }
  function setBusy(value) { busy = value; runBtn.disabled = value; writeBtn.disabled = value; }
  function getClient() {
    if (client) return client;
    if (!window.supabase?.createClient) throw Error('Supabase JS SDK не загрузился');
    if (!config.supabase?.url || !config.supabase?.anonKey) throw Error('В config.js отсутствуют Supabase URL или anonKey');
    client = window.supabase.createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
        storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
    });
    return client;
  }
  function tableName(def) { return config.supabase?.tables?.[def.tableKey] || def.defaultTable; }
  function diagnosticUrl() { return `${stringify(config.supabase?.url).replace(/\/+$/, '')}/functions/v1/diagnostics-venera`; }
  async function requestDiagnostic(method, data) {
    const response = await fetch(diagnosticUrl(), {
      method, cache: 'no-store',
      headers: { apikey: stringify(config.supabase?.anonKey), 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw Error(`HTTP ${response.status}: ${payload?.error || 'Диагностическая Edge Function не ответила'}`);
    if (payload.version !== VERSION) throw Error(`Версия сервера ${payload.version || '?'} не совпадает с ${VERSION}`);
    return payload;
  }
  async function readSection(def) {
    const response = await getClient().from(tableName(def)).select(def.id).eq('student_id', STUDENT_ID).limit(500);
    if (response.error) throw Error(describe(response.error));
    const data = response.data || [];
    return { count: data.filter(row => !stringify(row[def.id]).startsWith(PREFIX)).length, truncated: data.length >= 500 };
  }

  async function runAll() {
    if (busy) return;
    setBusy(true); reset(); setSummary('', 'Проверяю конфигурацию и четыре таблицы Supabase…');
    try {
      const basic = config.student?.id === STUDENT_ID && config.student?.level === 'A1'
        && Boolean(config.supabase?.url && config.supabase?.anonKey);
      addCheck('1. Конфигурация Венеры', basic ? 'ok' : 'bad',
        basic ? 'student_id=venera; уровень A1; Supabase URL и публичный ключ настроены' : 'Неверный student_id/уровень или не хватает настроек Supabase');
      if (!basic) throw Error('Проверь config.js');
      const sdkReady = Boolean(window.supabase?.createClient);
      addCheck('2. Supabase JavaScript SDK', sdkReady ? 'ok' : 'bad', sdkReady ? 'Библиотека успешно загружена' : 'CDN библиотеки не загрузился');
      if (!sdkReady) throw Error('Невозможно проверить базу данных без Supabase SDK');
      addCheck('3. Облачная синхронизация', config.features?.cloudSync === true ? 'ok' : 'bad',
        config.features?.cloudSync === true ? 'В настройках сайта cloudSync=true' : 'В config.js облачная синхронизация выключена');

      const localCounts = {};
      for (const def of definitions) {
        try {
          const result = await readSection(def);
          localCounts[def.section] = result;
          addCheck(`Чтение ${tableName(def)}`, result.truncated ? 'warn' : 'ok',
            `Браузер видит ${result.count} рабочих записей${result.truncated ? '; результат ограничен 500 строками' : ''}`);
        } catch (err) {
          localCounts[def.section] = { error: describe(err) };
          addCheck(`Чтение ${tableName(def)}`, 'bad', describe(err));
        }
      }
      let health;
      try {
        health = await requestDiagnostic('GET');
        addCheck('Edge Function diagnostics-venera', 'ok', `Версия ${health.version}. Сервер ответил`);
      } catch (err) {
        addCheck('Edge Function diagnostics-venera', 'bad', describe(err));
        throw Error('Не удалось получить серверную диагностику: ' + describe(err));
      }
      report.serverHealth = health;
      for (const def of definitions) {
        const server = health.database?.[def.section];
        const browser = localCounts[def.section];
        const equalCount = Boolean(server?.ok && !server?.countTruncated && browser && !browser.error && !browser.truncated && browser.count === server.visibleRows);
        addCheck(`RLS · браузер / сервер · ${def.label}`, equalCount ? 'ok' : 'bad',
          equalCount ? `Обе стороны видят ${browser.count} рабочих записей` :
            `Браузер: ${browser?.error || (browser?.count ?? '?')}; сервер: ${server?.error || (server?.visibleRows ?? '?')}. Возможна ошибка SELECT/RLS`);
      }
      addCheck('Telegram · получатель и тема №5', health.recipient?.ok ? 'ok' : 'bad',
        health.recipient?.ok ? 'Получатель включён, chat_id и thread_id=5 совпадают' : (health.recipient?.error || 'Неверный получатель'));
      addCheck('Telegram Bot API · бот', health.telegram?.bot?.ok ? 'ok' : 'bad',
        health.telegram?.bot?.ok ? `Telegram видит бота @${health.telegram.bot.username || 'без имени'}` :
          (health.telegram?.bot?.error || 'Бот недоступен'));
      addCheck('Telegram Bot API · доступ к группе', health.telegram?.chat?.ok ? 'ok' : 'bad',
        health.telegram?.chat?.ok ? 'Бот видит группу. Это не тест отправки сообщения в тему' :
          (health.telegram?.chat?.error || 'Бот не видит группу'));
      addCheck('Telegram · секрет webhook', health.telegram?.webhookConfigured ? 'ok' : 'warn',
        health.telegram?.webhookConfigured ? 'Секрет задан в Supabase' : 'NOTIFY_WEBHOOK_SECRET не настроен. Уведомления из Actions могут не работать');
      tgEl.replaceChildren();
      addKV(tgEl, 'Получатель', health.recipient?.ok ? 'OK' : 'Ошибка');
      addKV(tgEl, 'Тема Telegram', health.recipient?.threadId ?? 'не найдена');
      addKV(tgEl, 'Bot API', health.telegram?.bot?.ok ? 'OK' : 'Ошибка');
      addKV(tgEl, 'Группа', health.telegram?.chat?.ok ? 'OK' : 'Ошибка');
      addKV(tgEl, 'Фактическая отправка сообщения', 'Отдельный ручной тест в GitHub Actions');
    } catch (err) {
      report.errors.push({ stage: 'read_checks', error: describe(err) });
      addCheck('Диагностика остановлена', 'bad', describe(err));
    } finally {
      report.finishedAt = new Date().toISOString();
      const broken = report.checks.some(x => x.status === 'bad');
      const warnings = report.checks.some(x => x.status === 'warn');
      setSummary(broken ? 'bad' : warnings ? 'warn' : 'ok', broken ? 'Есть ошибки: открой первую красную строку выше' :
        warnings ? 'Основные проверки завершены, но есть предупреждения' :
        'Проверки чтения и доступности пройдены. Запись проверяется отдельной кнопкой');
      showReport(); setBusy(false);
    }
  }

  async function runWriteProbes() {
    if (busy) return;
    setBusy(true); dbResultEl.replaceChildren();
    const state = domText('div', 'summary', 'Проверяю запись и очистку четырёх типов прогресса…');
    dbResultEl.append(state);
    if (!report.startedAt) reset();
    let failed = false;
    let leftover = false;
    try {
      getClient();
      // Check server cleanup availability before creating any probe rows.
      await requestDiagnostic('GET');
      for (const def of definitions) {
        const probeId = PREFIX + crypto.randomUUID();
        const sectionReport = { status: 'started', steps: [], probeId };
        report.writeProbes[def.section] = sectionReport;
        const step = (name, status, detail) => {
          const label = `${def.label}: ${name}`;
          addCheck(label, status, detail);
          sectionReport.steps.push({ step: name, status, detail });
          if (status === 'bad') failed = true;
        };
        let inserted = false;
        try {
          const insert = await getClient().from(tableName(def)).insert(def.create(probeId))
            .select('*').single();
          if (insert.error) throw Error('INSERT: ' + describe(insert.error));
          inserted = true;
          step('INSERT', 'ok', 'Временная запись создана через браузер с ролью anon');

          const read = await getClient().from(tableName(def)).select('*')
            .eq('student_id', STUDENT_ID).eq(def.id, probeId).single();
          if (read.error || !read.data) throw Error('SELECT: ' + describe(read.error || 'запись не найдена'));
          step('SELECT', 'ok', 'Та же запись видна браузеру после отдельного чтения');

          const update = await getClient().from(tableName(def)).update(def.update())
            .eq('student_id', STUDENT_ID).eq(def.id, probeId).select('*').single();
          if (update.error) throw Error('UPDATE: ' + describe(update.error));
          if (!def.validate(update.data)) throw Error('UPDATE: сохранённые поля не совпадают с тестовыми');
          const reread = await getClient().from(tableName(def)).select('*')
            .eq('student_id', STUDENT_ID).eq(def.id, probeId).single();
          if (reread.error || !def.validate(reread.data)) throw Error('UPDATE: изменения не сохранились после повторного чтения');
          step('UPDATE + повторное чтение', 'ok', 'Изменения сохранены в Supabase и видны после новой загрузки');
          sectionReport.status = 'ok';
        } catch (err) {
          step('Ошибка записи', 'bad', describe(err));
          sectionReport.status = 'bad';
        } finally {
          try {
            const cleanup = await requestDiagnostic('POST', { action: 'cleanup', studentId: STUDENT_ID, section: def.section, probeId });
            if (!cleanup.cleaned) throw Error('Сервер не подтвердил очистку');
            const check = await getClient().from(tableName(def)).select(def.id)
              .eq('student_id', STUDENT_ID).eq(def.id, probeId).maybeSingle();
            if (check.error || check.data) throw Error('Проверка удаления не пройдена: ' + describe(check.error || 'запись осталась'));
            step('Очистка', 'ok', inserted ? 'Временная запись удалена сервером; реальные данные не затронуты' : 'Сервер подтвердил отсутствие временной записи');
          } catch (err) {
            leftover = true;
            step('Очистка', 'bad', describe(err) + '; сообщи ID из JSON-отчёта для безопасной очистки');
          }
        }
      }
    } catch (err) {
      failed = true;
      addCheck('Тест записи не запущен', 'bad', describe(err));
      report.errors.push({ stage: 'write_checks', error: describe(err) });
    } finally {
      state.className = `summary ${failed || leftover ? 'bad' : 'ok'}`;
      state.textContent = failed || leftover
        ? 'Часть операций не прошла. Посмотри красные строки, затем скопируй JSON-отчёт.'
        : 'Все четыре раздела прошли INSERT → SELECT → UPDATE → повторное чтение → удаление. Тестовые записи удалены.';
      report.finishedAt = new Date().toISOString(); showReport(); setBusy(false);
    }
  }

  $('#copy-report').addEventListener('click', async () => {
    const text = reportEl.textContent;
    try { await navigator.clipboard.writeText(text); $('#copy-report').textContent = 'Скопировано ✓'; }
    catch { window.prompt('Скопируй отчёт:', text); }
  });
  $('#reload-page').addEventListener('click', () => location.reload());
  runBtn.addEventListener('click', runAll);
  writeBtn.addEventListener('click', runWriteProbes);
  addKV(cfgEl, 'student_id', config.student?.id || 'не задан');
  addKV(cfgEl, 'Уровень', config.student?.level || 'не задан');
  addKV(cfgEl, 'Учебник', `${config.student?.textbook || '—'} ${config.student?.textbookEdition || ''}`);
  addKV(cfgEl, 'Supabase URL', config.supabase?.url || 'не задан');
  addKV(cfgEl, 'Ключ anon', config.supabase?.anonKey ? 'есть (значение скрыто)' : 'нет');
  addKV(cfgEl, 'Cloud sync', config.features?.cloudSync === true ? 'включена' : 'выключена');
  addKV(cfgEl, 'Ожидаемая Telegram-тема', EXPECTED_TOPIC);
  addKV(cfgEl, 'Источник', location.origin);
  showReport();
})();
