#!/usr/bin/env node
import { startServer } from './server.mjs';

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
const host = process.env.HOST || '0.0.0.0';

const server = await startServer({ port, host });
const shutdown = () => { server.close().then(() => process.exit(0)); };
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
console.log(`[moonk-net] listening on ws://${host}:${server.port}  (health: http://${host}:${server.port}/health)`);
