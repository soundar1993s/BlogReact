jest.mock('../src/config/db', () => ({
  pool: { query: jest.fn(), end: jest.fn() },
  checkDbConnection: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const { pool, checkDbConnection } = require('../src/config/db');
const token = jwt.sign({ id: 7, name: 'Writer' }, process.env.JWT_SECRET);
const authenticated = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

beforeEach(() => jest.resetAllMocks());

test('liveness stays healthy when readiness loses the database', async () => {
  checkDbConnection.mockRejectedValue(new Error('private database details'));
  await request(app).get('/healthz').expect(200);
  const response = await request(app).get('/readyz').expect(503);
  expect(response.body).toEqual({ status: 'not-ready' });
  checkDbConnection.mockResolvedValue(true);
  await request(app).get('/readyz').expect(200);
});

test('metrics and unknown routes are available without leaking server details', async () => {
  const response = await request(app).get('/metrics').expect(200);
  expect(response.text).toContain('http_request_duration_seconds');
  expect(response.headers['x-powered-by']).toBeUndefined();
  await request(app).get('/missing').expect(404);
});

test('invalid JSON is handled by the error middleware', async () => {
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
});

test('registration validates input and rejects duplicate email addresses', async () => {
  await request(app).post('/api/auth/register').send({}).expect(400);
  expect(pool.query).not.toHaveBeenCalled();
  pool.query.mockResolvedValue([[{ id: 1 }]]);
  await request(app).post('/api/auth/register')
    .send({ name: 'Writer', email: 'writer@example.com', password: 'test-password-long' }).expect(409);
});

test('registration hashes passwords and issues a verifiable JWT', async () => {
  pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 7 }]);
  const response = await request(app).post('/api/auth/register')
    .send({ name: 'Writer', email: 'writer@example.com', password: 'test-password-long' }).expect(201);
  const parameters = pool.query.mock.calls[1][1];
  expect(await bcrypt.compare('test-password-long', parameters.passwordHash)).toBe(true);
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).id).toBe(7);
  expect(response.body.user).not.toHaveProperty('password_hash');
});

test('login rejects missing input, unknown users, and incorrect passwords', async () => {
  await request(app).post('/api/auth/login').send({}).expect(400);
  pool.query.mockResolvedValueOnce([[]]);
  const credentials = { email: 'writer@example.com', password: 'wrong-password' };
  await request(app).post('/api/auth/login').send(credentials).expect(401);
  pool.query.mockResolvedValueOnce([[{ password_hash: await bcrypt.hash('another-password', 4) }]]);
  await request(app).post('/api/auth/login').send(credentials).expect(401);
});

test('login accepts correct credentials', async () => {
  pool.query.mockResolvedValue([[{ id: 7, name: 'Writer', email: 'writer@example.com',
    password_hash: await bcrypt.hash('test-password-long', 4) }]]);
  const response = await request(app).post('/api/auth/login')
    .send({ email: 'writer@example.com', password: 'test-password-long' }).expect(200);
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).id).toBe(7);
});

test.each(['/api/auth/login', '/api/auth/register'])('database errors on %s return generic messages', async (path) => {
  pool.query.mockRejectedValue(new Error('database unavailable'));
  await request(app).post(path)
    .send({ name: 'Writer', email: 'writer@example.com', password: 'test-password-long' }).expect(500);
});

test('post listing parameterizes search and clamps pagination', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 1 }]]).mockResolvedValueOnce([[{ total: 1 }]]);
  const response = await request(app).get('/api/posts?page=-2&limit=-1&tag=devops&search=test').expect(200);
  expect(response.body).toMatchObject({ page: 1, limit: 1, total: 1 });
  expect(pool.query.mock.calls[0][1]).toMatchObject({ limit: 1, offset: 0, tag: 'devops', search: '%test%' });
});

test('post detail only queries published posts and includes comments', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 1, slug: 'test' }]]).mockResolvedValueOnce([[{ body: 'Hello' }]]);
  const response = await authenticated('get', '/api/posts/test').expect(200);
  expect(pool.query.mock.calls[0][0]).toContain("p.status = 'published'");
  expect(response.body.comments).toEqual([{ body: 'Hello' }]);
});

test('optional auth tolerates invalid tokens and missing posts return 404', async () => {
  pool.query.mockResolvedValue([[]]);
  await request(app).get('/api/posts/missing').set('Authorization', 'Bearer invalid').expect(404);
});

test('post writes require valid authentication and validated content', async () => {
  await request(app).post('/api/posts').send({}).expect(401);
  await request(app).post('/api/posts').set('Authorization', 'Bearer invalid').send({}).expect(401);
  await authenticated('post', '/api/posts').send({ title: 'x', body: 'short' }).expect(400);
  expect(pool.query).not.toHaveBeenCalled();
});

test('authenticated users can create posts with defaults and explicit metadata', async () => {
  pool.query.mockResolvedValue([{ insertId: 8 }]);
  const payload = { title: 'My new post', body: 'This is a sufficiently long blog post body.' };
  const response = await authenticated('post', '/api/posts').send(payload).expect(201);
  expect(response.body.slug).toMatch(/^my-new-post-/);
  expect(pool.query.mock.calls[0][1]).toMatchObject({ authorId: 7, tag: 'general', coverImage: null });
  await authenticated('post', '/api/posts')
    .send({ ...payload, tag: 'devops', excerpt: 'Excerpt', coverImage: 'https://example.com/image.png' }).expect(201);
});

test('comments validate content, require an existing post, and store the author', async () => {
  await authenticated('post', '/api/posts/test/comments').send({ body: '' }).expect(400);
  pool.query.mockResolvedValueOnce([[]]);
  await authenticated('post', '/api/posts/missing/comments').send({ body: 'Hello' }).expect(404);
  pool.query.mockResolvedValueOnce([[{ id: 2 }]]).mockResolvedValueOnce([{ insertId: 9 }]);
  await authenticated('post', '/api/posts/test/comments').send({ body: 'Hello' }).expect(201);
  expect(pool.query.mock.calls.at(-1)[1]).toEqual({ postId: 2, authorId: 7, body: 'Hello' });
});

test('database failures are handled on all post routes', async () => {
  pool.query.mockRejectedValue(new Error('database unavailable'));
  await request(app).get('/api/posts').expect(500);
  await request(app).get('/api/posts/test').expect(500);
  await authenticated('post', '/api/posts').send({ title: 'New post', body: 'A sufficiently long body for validation.' }).expect(500);
  await authenticated('post', '/api/posts/test/comments').send({ body: 'Hello' }).expect(500);
});
