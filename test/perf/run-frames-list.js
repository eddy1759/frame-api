#!/usr/bin/env node

import { spawn } from 'node:child_process';


const PORT = process.env.PORT ?? '8000';
const SCRIPT_PATH = process.env.SCRIPT_PATH ?? 'test/perf/frames-list.k6.js';
const HEALTH_BASE_URL = process.env.HEALTH_BASE_URL ?? '';

const isLinux = platform() === 'linux';

const hostBaseUrl = HEALTH_BASE_URL || `http://localhost:${PORT}`;
const healthUrl = `${hostBaseUrl}/api/v1/health`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

async function checkHealth() {
  process.stdout.write(`Checking API health at ${healthUrl}\n`);

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetchWithTimeout(healthUrl, 3000);
      if (res.status === 200) return true;
    } catch {}

    await sleep(1000);
  }

  return false;
}

function buildDockerConfig() {
  if (isLinux) {
    return {
      baseUrl: `http://localhost:${PORT}`,
      args: ['--network=host'],
    };
  }

  return {
    baseUrl: `http://host.docker.internal:${PORT}`,
    args: ['--add-host=host.docker.internal:host-gateway'],
  };
}

async function runK6() {
  const { baseUrl, args } = buildDockerConfig();

  process.stdout.write(`Starting k6 against ${baseUrl}\n`);

  const dockerArgs = [
    'run',
    '--rm',
    ...args,
    '-v',
    `${process.cwd()}:/work`,
    '-w',
    '/work',
    '-e',
    'RUNTIME=docker',
    '-e',
    `PORT=${PORT}`,
    '-e',
    `BASE_URL=${baseUrl}`,
    'grafana/k6',
    'run',
    SCRIPT_PATH,
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn('docker', dockerArgs, {
      stdio: 'inherit',
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`k6 exited with code ${code}`));
    });
  });
}

async function main() {
  const healthy = await checkHealth();

  if (!healthy) {
    process.stderr.write(`API not reachable at ${healthUrl}\n`);
    process.exit(1);
  }

  await runK6();
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
