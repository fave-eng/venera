// Invoked server-side only by GitHub Actions. Never expose NOTIFY_WEBHOOK_SECRET on a site.
const project = 'zqzgarvmpqqqaobeicpc';
const secret = process.env.NOTIFY_WEBHOOK_SECRET || '';
if (!secret) { console.error('Missing NOTIFY_WEBHOOK_SECRET'); process.exit(1); }
const action = process.env.NOTIFICATION_ACTION || 'test';
const input = { action, title: process.env.MATERIAL_TITLE || '',
  description: process.env.MATERIAL_DESCRIPTION || '', url: process.env.MATERIAL_URL || '' };
const response = await fetch(`https://${project}.supabase.co/functions/v1/notify-venera-telegram`, {
  method: 'POST', headers: {'content-type':'application/json','x-notify-secret':secret},
  body: JSON.stringify(input)
});
const data = await response.json().catch(() => ({}));
if (!response.ok || !data.ok) { console.error('Telegram delivery failed', response.status, data.error || 'Unknown'); process.exit(1); }
console.log(`Delivered to Venera's Telegram topic. Message id: ${data.telegramMessageId}`);
