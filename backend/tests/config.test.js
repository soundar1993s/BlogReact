jest.mock('mysql2/promise', () => ({ createPool: jest.fn(() => ({ query: jest.fn() })) }));
const mysql = require('mysql2/promise');

test('database configuration refuses a missing password', () => {
  const password = process.env.DB_PASSWORD;
  delete process.env.DB_PASSWORD;
  try {
    jest.isolateModules(() => expect(() => require('../src/config/db')).toThrow('DB_PASSWORD is required'));
  } finally { process.env.DB_PASSWORD = password; }
});

test('readiness performs a bounded database query and propagates failures', async () => {
  let db;
  jest.isolateModules(() => { db = require('../src/config/db'); });
  expect(mysql.createPool).toHaveBeenCalledWith(expect.objectContaining({ password: process.env.DB_PASSWORD, queueLimit: 100 }));
  db.pool.query.mockResolvedValue([[]]);
  await expect(db.checkDbConnection()).resolves.toBe(true);
  expect(db.pool.query).toHaveBeenCalledWith({ sql: 'SELECT 1', timeout: 5000 });
  db.pool.query.mockRejectedValue(new Error('connection refused'));
  await expect(db.checkDbConnection()).rejects.toThrow('connection refused');
});

test('JWT configuration refuses short or missing keys', () => {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'short';
  try {
    jest.isolateModules(() => expect(() => require('../src/middleware/auth')).toThrow('JWT_SECRET must contain at least 32 bytes'));
  } finally { process.env.JWT_SECRET = secret; }
});
