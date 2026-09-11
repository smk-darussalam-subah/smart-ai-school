'use strict';

const fs = require('fs');
const net = require('net');

const port = Number(process.env.SMTP_PORT || 2525);
const reject = process.env.SMTP_REJECT === '1';
const output = process.env.SMTP_OUTPUT || '/evidence/messages.ndjson';

fs.mkdirSync(require('path').dirname(output), { recursive: true });

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');
  socket.write('220 diis-synthetic-smtp ESMTP\r\n');

  let buffer = '';
  let dataMode = false;
  let message = '';
  let loginStage = 0;

  const reply = (line) => socket.write(`${line}\r\n`);

  const command = (line) => {
    if (loginStage > 0) {
      loginStage += 1;
      if (loginStage >= 3) {
        loginStage = 0;
        reply('235 2.7.0 Authentication successful');
      } else {
        reply('334 UGFzc3dvcmQ6');
      }
      return;
    }
    if (/^(EHLO|HELO)\b/i.test(line)) {
      socket.write('250-diis-synthetic-smtp\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1048576\r\n');
    } else if (/^AUTH PLAIN\b/i.test(line)) {
      reply('235 2.7.0 Authentication successful');
    } else if (/^AUTH LOGIN\b/i.test(line)) {
      loginStage = 1;
      reply('334 VXNlcm5hbWU6');
    } else if (/^MAIL FROM:/i.test(line)) {
      reply('250 2.1.0 Sender accepted');
    } else if (/^RCPT TO:/i.test(line)) {
      reply(reject ? '550 5.7.1 Synthetic rejection' : '250 2.1.5 Recipient accepted');
    } else if (/^DATA$/i.test(line)) {
      dataMode = true;
      message = '';
      reply('354 End data with <CR><LF>.<CR><LF>');
    } else if (/^RSET$/i.test(line)) {
      dataMode = false;
      message = '';
      reply('250 2.0.0 Reset');
    } else if (/^QUIT$/i.test(line)) {
      reply('221 2.0.0 Bye');
      socket.end();
    } else if (/^NOOP$/i.test(line)) {
      reply('250 2.0.0 OK');
    } else {
      reply('250 2.0.0 OK');
    }
  };

  socket.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      if (dataMode) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        message += buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        fs.appendFileSync(output, `${JSON.stringify({ message })}\n`, { mode: 0o600 });
        dataMode = false;
        message = '';
        reply('250 2.0.0 Message accepted');
        continue;
      }
      const end = buffer.indexOf('\r\n');
      if (end === -1) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      command(line);
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`SMTP_SINK_READY port=${port} reject=${reject}\n`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
