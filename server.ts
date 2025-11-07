import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initWebSocket } from './lib/websocket';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3030', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Inicializar WebSocket
  initWebSocket(httpServer);

  httpServer
    .once('error', (err) => {
      process.exit(1);
    })
    .listen(port, () => {
    });
});

