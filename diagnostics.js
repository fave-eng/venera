(() => {
  'use strict';
  const button = document.querySelector('#run-checks');
  const results = document.querySelector('#diag-results');
  const add = (label, good, details = '') => {
    const row = document.createElement('div'); row.className = 'diag-row';
    const title = document.createElement('strong'); title.textContent = label;
    const val = document.createElement('span'); val.className = `diag-state ${good ? 'ok' : 'bad'}`;
    val.textContent = `${good ? '✓ OK' : '✕ Ошибка'}${details ? ' · ' + details : ''}`;
    row.append(title, val); results.append(row);
  };
  button?.addEventListener('click', async () => {
    button.disabled = true;
    results.replaceChildren();
    const cfg = window.APP_CONFIG;
    add('config.js · Венера', cfg?.student?.id === 'venera' && cfg?.student?.level === 'A1');
    add('Новый сайт · каталоги пока пустые',
      Array.isArray(window.VOCABULARY_DATA) && window.VOCABULARY_DATA.length === 0 &&
      Array.isArray(window.GRAMMAR_DATA) && window.GRAMMAR_DATA.length === 0);
    add('Синхронизация прогресса включена', cfg?.features?.cloudSync === true);
    const url = cfg?.supabase?.url;
    const fn = cfg?.supabase?.notificationFunction;
    if (!url || !fn) { add('Edge Function', false, 'нет адреса'); button.disabled = false; return; }
    try {
      const response = await fetch(`${url}/functions/v1/${fn}`, {method:'GET',cache:'no-store'});
      const result = await response.json();
      add('Edge Function', Boolean(response.ok && result.ok), result.version || `HTTP ${response.status}`);
      add('Получатель и тема №5 в Supabase', result.recipientConfigured === true && result.topicId === 5);
      add('Telegram-бот', result.botConfigured === true);
      add('Секрет отправки на сервере', result.webhookConfigured === true);
    } catch (error) { add('Подключение к Supabase', false, 'Нет ответа от функции'); }
    button.disabled = false;
  });
})();
