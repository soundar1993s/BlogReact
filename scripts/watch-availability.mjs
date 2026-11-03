import { appendFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const url = process.env.APP_URL;
const duration = Number(process.env.MONITOR_SECONDS || 900);
if (!url || !/^https?:\/\//.test(url)) throw new Error('APP_URL is required');
if (!Number.isFinite(duration) || duration < 1 || duration > 3600) throw new Error('Invalid monitor duration');
const file = process.env.MONITOR_OUTPUT || 'reports/availability.csv';
writeFileSync(file, 'timestamp_utc,status,latency_ms\n');
let samples = 0;
let failures = 0;
const end = Date.now() + duration * 1000;
while (Date.now() < end) {
  const started = Date.now();
  let status = 'NETWORK_ERROR';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    status = String(response.status);
    await response.arrayBuffer();
    if (!response.ok) failures++;
  } catch {
    failures++;
  }
  samples++;
  appendFileSync(file, `${new Date().toISOString()},${status},${Date.now() - started}\n`);
  await setTimeout(2000);
}
console.log(JSON.stringify({ url, samples, failures, intervalSeconds: 2, output: file }));
// Measures the frontend HTTP response; functional API/DB smoke checks are separate.
process.exitCode = failures ? 1 : 0;
