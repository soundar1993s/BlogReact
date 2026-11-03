import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.APP_URL;
if (!base || !/^https?:\/\//.test(base)) throw new Error('APP_URL must be the application URL');
async function call(path, options = {}) {
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `${path} returned ${response.status}`);
  return response.json();
}
const home = await fetch(base, { signal: AbortSignal.timeout(15000) });
assert.ok(home.ok);
assert.ok((await home.text()).includes('<div id="root">'));
await call('/api/posts');
// Read-only validation runs on every deployment. Explicit write mode creates evidence.
if (process.env.SMOKE_WRITE === 'true') {
  const identifier = randomUUID();
  const account = { name: 'Pipeline Evidence', email: `ci-${identifier}@example.com`, password: randomUUID() };
  const registration = await call('/api/auth/register', { method: 'POST', body: JSON.stringify(account) });
  const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify(account) });
  assert.equal(login.user.id, registration.user.id);
  const headers = { Authorization: `Bearer ${login.token}` };
  const post = await call('/api/posts', { method: 'POST', headers,
    body: JSON.stringify({ title: `Deployment evidence ${identifier}`, body: 'Created by the end-to-end deployment verification script.', tag: 'evidence' }) });
  await call(`/api/posts/${post.slug}/comments`, { method: 'POST', headers, body: JSON.stringify({ body: 'Verified database write and read.' }) });
  const detail = await call(`/api/posts/${post.slug}`);
  assert.equal(detail.comments.length, 1);
  console.log(`Evidence post: ${post.slug}`);
}
if (process.env.EVIDENCE_SLUG) {
  const detail = await call(`/api/posts/${process.env.EVIDENCE_SLUG}`);
  assert.ok(detail.comments.length >= 1, 'Evidence comment must persist');
}
console.log('Frontend, API, and database smoke checks passed.');
