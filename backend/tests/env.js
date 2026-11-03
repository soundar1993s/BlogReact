// Test-only inputs; the database is mocked in unit tests.
process.env.JWT_SECRET = 'unit-test-only-signing-key-32-bytes-long';
process.env.DB_PASSWORD = 'unit-test-only';
