import http from 'node:http';
import pg from 'pg';
import { createHandler } from './app.mjs';
import { startBackupScheduler } from './backupScheduler.mjs';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production' && !process.env.BOOTSTRAP_TOKEN) throw new Error('BOOTSTRAP_TOKEN is required in production until bootstrap is disabled');
if (process.env.NODE_ENV === 'production' && !process.env.OFFLINE_LEASE_SECRET) throw new Error('OFFLINE_LEASE_SECRET is required in production');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || 10) });
const handler = createHandler(pool);
const port = Number(process.env.PORT || 8787);
const server = http.createServer(handler);
const stopBackupScheduler = startBackupScheduler(pool);

server.listen(port, () => console.log(`ZHIROX POS server listening on ${port}`));

const shutdown = async signal => {
  console.log(`${signal}: shutting down`);
  stopBackupScheduler();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
