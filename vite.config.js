import fs from 'fs';
import path from 'path';

function logPlugin() {
  return {
    name: 'log-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/log' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            const logFile = path.resolve(process.cwd(), 'client-debug.log');
            fs.appendFileSync(logFile, body + '\n');
            res.statusCode = 200;
            res.end('ok');
          });
        } else {
          next();
        }
      });
    }
  };
}

export default {
    plugins: [logPlugin()],
    server: {
      port: 3000, // Change if needed
      host: true, // Allow external access
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'grown-concrete-antelope.ngrok-free.app' // Add your ngrok host here
      ]
    }
  };