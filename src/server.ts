import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf8'),
) as { version: string; name: string };

const PORT = Number(process.env.PORT ?? 3001);
const HOST = '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

const app: FastifyInstance = Fastify({
  logger: {
    level: LOG_LEVEL,
    transport:
      NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,
  },
  trustProxy: true,
  bodyLimit: 25 * 1024 * 1024,
});

app.get('/health', async () => ({
  status: 'ok',
  ts: Date.now(),
  version: pkg.version,
}));

app.get('/', async () => ({
  service: pkg.name,
  version: pkg.version,
}));

const webhookChannels = ['telegram', 'whatsapp', 'widget'] as const;
for (const channel of webhookChannels) {
  app.post<{ Params: { botId: string }; Body: unknown }>(
    `/webhook/${channel}/:botId`,
    async (req, reply) => {
      req.log.info(
        { channel, botId: req.params.botId, body: req.body },
        `webhook:${channel} received`,
      );
      return reply.code(200).send({ ok: true });
    },
  );
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutdown initiated');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'shutdown failed');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
