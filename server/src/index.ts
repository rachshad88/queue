import { createServer } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { connect, disconnect } from './db';
import { attachRealtime } from './realtime';
import { connectCache } from './sharedCache';

async function main(): Promise<void> {
  if (config.env === 'production' && config.sessionSecret === 'change-me-in-production') {
    throw new Error('Set SESSION_SECRET before running in production.');
  }
  await connect();
  await connectCache();
  const server = createServer(createApp());
  attachRealtime(server);
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT in .env to a free port.` : error);
    process.exit(1);
  });
  server.listen(config.port, config.bindAddress, () => {
    console.log(`RHU queue listening on ${config.bindAddress}:${config.port}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
