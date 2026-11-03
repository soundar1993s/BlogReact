import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const context = execFileSync('kubectl', ['config', 'current-context'], { encoding: 'utf8' }).trim();
if (!process.env.KUBE_CONTEXT || context !== process.env.KUBE_CONTEXT) {
  throw new Error('Set KUBE_CONTEXT to the intended cluster context before creating secrets');
}
const make = () => randomBytes(48).toString('base64');
const secrets = [
  ['blogapp', 'database-credentials', { DB_PASSWORD: make(), MYSQL_ROOT_PASSWORD: make() }],
  ['blogapp', 'backend-credentials', { JWT_SECRET: make() }],
  ['monitoring', 'grafana-admin', { 'admin-user': 'admin', 'admin-password': make() }],
];
// Refuse rotation: changing MySQL env vars does not rotate an initialized database.
for (const [namespace, name] of secrets) {
  const existing = execFileSync('kubectl', ['get', 'secret', name, '-n', namespace, '--ignore-not-found', '-o', 'name'], { encoding: 'utf8' });
  if (existing.trim()) throw new Error(`${namespace}/${name} already exists; rotate existing credentials separately`);
}
for (const [namespace, name, stringData] of secrets) {
  execFileSync('kubectl', ['create', '-f', '-'], {
    input: JSON.stringify({ apiVersion: 'v1', kind: 'Secret', metadata: { name, namespace }, type: 'Opaque', stringData }),
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  console.log(`Created ${namespace}/${name}`);
}
