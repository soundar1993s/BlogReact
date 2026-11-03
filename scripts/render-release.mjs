import { execFileSync } from 'node:child_process';
import { parseAllDocuments, stringify } from 'yaml';

const { ECR_REGISTRY, IMAGE_TAG } = process.env;
if (!/^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$/.test(ECR_REGISTRY || '')) throw new Error('Invalid ECR_REGISTRY');
if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(IMAGE_TAG || '')) throw new Error('Invalid IMAGE_TAG');
const rendered = execFileSync('kubectl', ['kustomize', 'k8s'], { encoding: 'utf8' });
// Cluster-scoped objects are provisioned once by an administrator.
const resources = parseAllDocuments(rendered).map(d => d.toJSON())
  .filter(d => !['Namespace', 'StorageClass'].includes(d.kind));
for (const resource of resources) {
  for (const container of resource.spec?.template?.spec?.containers || []) {
    if (resource.kind === 'Deployment') {
      container.image = `${ECR_REGISTRY}/blogapp-${container.name}:${IMAGE_TAG}`;
    }
  }
}
process.stdout.write(resources.map(d => stringify(d)).join('---\n'));
