import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const { ECR_REGISTRY: registry, IMAGE_TAG: tag } = process.env;
if (!/^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$/.test(registry || '')) throw new Error('Invalid ECR registry');
if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(tag || '')) throw new Error('Invalid image tag');
const capture = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
async function retry(label, action) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return action(); }
    catch {
      if (attempt === 3) throw new Error(`${label} failed after three attempts`);
      console.error(`${label} failed; retrying after ${attempt * 5} seconds`);
      await setTimeout(attempt * 5000);
    }
  }
}

await retry('ECR login', () => {
  const password = capture('aws', ['ecr', 'get-login-password']);
  // The token goes through stdin only, never an argument or log message.
  execFileSync('docker', ['login', '--username', 'AWS', '--password-stdin', registry], {
    input: password, stdio: ['pipe', 'inherit', 'inherit'],
  });
});
for (const component of ['backend', 'frontend']) {
  const repository = `blogapp-${component}`;
  const local = `${repository}:${tag}`;
  const remote = `${registry}/${repository}:${tag}`;
  const localConfig = capture('docker', ['image', 'inspect', local, '--format', '{{.Id}}']);
  run('docker', ['tag', local, remote]);
  await retry(`Publish ${component}`, () => {
    const result = JSON.parse(capture('aws', ['ecr', 'batch-get-image', '--repository-name', repository,
      '--image-ids', `imageTag=${tag}`, '--output', 'json']));
    if (result.images?.length) {
      const manifest = JSON.parse(result.images[0].imageManifest);
      if (manifest.config?.digest !== localConfig) throw new Error('Immutable tag already points to a different image');
      console.log(`Verified existing immutable image ${remote}`);
      return;
    }
    // The EKS workers are amd64; publish that runtime manifest explicitly.
    run('docker', ['push', '--platform', 'linux/amd64', remote]);
  });
}
