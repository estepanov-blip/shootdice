// Minimal mock of the Telegram Bot API for local duel tests.
// Usage: node scripts/qa/mock-telegram.mjs <port> <logfile>
import http from 'node:http';
import fs from 'node:fs';
const [port = '8788', logFile = '/tmp/tg-mock.jsonl'] = process.argv.slice(2);
fs.writeFileSync(logFile, '');
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const method = req.url.split('/').pop();
      let params = {};
      try { params = JSON.parse(body || '{}'); } catch {}
      fs.appendFileSync(logFile, JSON.stringify({ method, params }) + '\n');
      let result = true;
      if (method === 'getMe') result = { id: 1, is_bot: true, username: 'shootdice_test_bot' };
      if (method === 'savePreparedInlineMessage') result = { id: 'prep-' + params.result?.id, expiration_date: 0 };
      if (method === 'sendMessage') result = { message_id: 1 };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    });
  })
  .listen(Number(port), '127.0.0.1', () => console.log('mock telegram on', port));
