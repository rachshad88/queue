import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: __dirname,
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    fileParallelism: false,
    // Pin everything deployment-specific so a production .env never leaks into tests
    // (process.loadEnvFile does not override variables that are already set).
    env: {
      NODE_ENV: 'test',
      MONGO_URL: 'mongodb://127.0.0.1:27117/rhu_queue_test',
      BACKUP_DIR: '/tmp/rhu-queue-test-backups',
      SESSION_SECURE: '0',
      TRUST_PROXY_HEADER: '0',
      BASE_PATH: '',
      BIND_ADDR: '127.0.0.1',
    },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
