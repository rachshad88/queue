// PM2 process file. Start with: pm2 start ecosystem.config.cjs && pm2 save
// Settings (database URL, secrets, BASE_PATH) come from .env.
module.exports = {
  apps: [
    {
      name: 'rhu-queue',
      cwd: __dirname,
      script: 'node_modules/.bin/tsx',
      args: 'server/src/index.ts',
      interpreter: 'none',
      // One process only: throttle and lock state live in memory.
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      kill_timeout: 8000,
      time: true,
    },
  ],
};
