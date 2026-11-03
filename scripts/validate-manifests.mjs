import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseAllDocuments } from 'yaml';
import { readFileSync } from 'node:fs';
const resources = parseAllDocuments(execFileSync('kubectl', ['kustomize', 'k8s'], { encoding: 'utf8' }))
  .map(document => { assert.equal(document.errors.length, 0); return document.toJSON(); });
const find = (kind, name) => resources.find(r => r.kind === kind && r.metadata.name === name);
assert.ok(find('Namespace', 'blogapp'));
assert.ok(find('StorageClass', 'blogapp-gp3'));
assert.equal(find('ConfigMap', 'mysql-init').data['init.sql'].replaceAll('\r\n', '\n'), readFileSync('database/init.sql', 'utf8').replaceAll('\r\n', '\n'));
for (const name of ['backend', 'frontend']) {
  const deployment = find('Deployment', name);
  assert.ok(deployment.spec.replicas >= 2);
  assert.equal(deployment.spec.strategy.rollingUpdate.maxUnavailable, 0);
  for (const container of deployment.spec.template.spec.containers) {
    assert.ok(container.readinessProbe);
    assert.ok(container.livenessProbe);
    assert.ok(container.resources.requests);
    assert.ok(container.resources.limits);
    assert.equal(container.securityContext.allowPrivilegeEscalation, false);
  }
}
assert.ok(find('StatefulSet', 'mysql').spec.volumeClaimTemplates.length);
assert.ok(find('NetworkPolicy', 'mysql-backend-only'));
assert.ok(!resources.some(r => r.kind === 'Secret'), 'Credentials must be injected outside Git');
console.log(`Validated ${resources.length} rendered Kubernetes resources and shared schema.`);
