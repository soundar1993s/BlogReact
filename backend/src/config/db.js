const mysql = require('mysql2/promise');

if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD is required');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-service',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'bloguser',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'blogdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 100,
  connectTimeout: 5000,
  namedPlaceholders: true,
});

async function checkDbConnection() {
  await pool.query({ sql: 'SELECT 1', timeout: 5000 });
  return true;
}

module.exports = { pool, checkDbConnection };
