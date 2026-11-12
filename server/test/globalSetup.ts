import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { MongoClient } from 'mongodb';

/**
 * Runs a throwaway MongoDB for the suite so tests never touch a real
 * database. Uses a disposable Docker container (mongo:4.4, the production
 * version) unless TEST_MONGO_EXTERNAL=1 says one is already listening on 27117.
 */
const CONTAINER = 'rhu-queue-test-mongo';
const external = process.env.TEST_MONGO_EXTERNAL === '1';

const docker = (...args: string[]): void => {
  execFileSync('docker', args, { stdio: 'ignore' });
};

export async function setup(): Promise<void> {
  if (!external) {
    try {
      docker('rm', '-f', CONTAINER);
    } catch {
      // No leftover container.
    }
    docker('run', '-d', '--rm', '--name', CONTAINER, '-p', '127.0.0.1:27117:27017', '--tmpfs', '/data/db', 'mongo:4.4');
  }
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const client = new MongoClient('mongodb://127.0.0.1:27117', { serverSelectionTimeoutMS: 500 });
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      await client.close();
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error('Test MongoDB did not start on 127.0.0.1:27117.');
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

export async function teardown(): Promise<void> {
  if (!external) {
    try {
      docker('rm', '-f', CONTAINER);
    } catch {
      // Already gone.
    }
  }
  rmSync('/tmp/rhu-queue-test-backups', { recursive: true, force: true });
}
