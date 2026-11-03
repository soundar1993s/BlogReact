import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from './client';

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

test('lists posts with encoded filters and same-origin URL', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  expect(await api.listPosts({ search: 'cloud & containers' })).toEqual({ data: [] });
  expect(fetch.mock.calls[0][0]).toBe('/api/posts?search=cloud+%26+containers');
});

test('sends bearer authentication and JSON for a new post', async () => {
  localStorage.getItem.mockReturnValue('session-token');
  fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
  await api.createPost({ title: 'Hello' });
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"title":"Hello"}',
    headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' } });
});

test.each([
  [{ error: 'Invalid credentials' }, 'Invalid credentials'],
  [{ errors: [{ msg: 'Valid email required' }] }, 'Valid email required'],
  [{}, 'Request failed'],
])('propagates API errors', async (body, message) => {
  fetch.mockResolvedValue({ ok: false, json: async () => body });
  await expect(api.login({})).rejects.toThrow(message);
});

test('handles non-JSON failures', async () => {
  fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('bad JSON'); } });
  await expect(api.listPosts()).rejects.toThrow('Request failed');
});

test('calls detail, registration and comment endpoints', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  await api.getPost('first-post');
  await api.register({ name: 'Writer' });
  await api.addComment('first-post', 'Nice post');
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/posts/first-post', '/api/auth/register', '/api/posts/first-post/comments',
  ]);
});
