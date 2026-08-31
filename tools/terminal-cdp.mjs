const endpoint = process.env.PANITAS_CDP_ENDPOINT || 'http://127.0.0.1:9222/json';
const encodedExpression = process.argv[2] || '';

if (!encodedExpression) {
  console.error('Uso: node tools/terminal-cdp.mjs <expresión JavaScript en Base64>');
  process.exit(2);
}

const expression = Buffer.from(encodedExpression, 'base64').toString('utf8');
const targets = await fetch(endpoint).then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);

if (!page) {
  console.error('No se encontró una WebView depurable de Los Panitas.');
  process.exit(3);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const requestId = 1;

const response = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('La terminal no respondió a tiempo.')), 15000);
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      id: requestId,
      method: 'Runtime.evaluate',
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      }
    }));
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== requestId) return;
    clearTimeout(timeout);
    resolve(message);
  });
  socket.addEventListener('error', () => reject(new Error('Falló la conexión con la WebView.')));
});

socket.close();
if (response.error || response.result?.exceptionDetails) {
  console.error(JSON.stringify(response, null, 2));
  process.exit(4);
}

console.log(JSON.stringify(response.result?.result?.value ?? null, null, 2));
