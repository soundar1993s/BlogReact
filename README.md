# BlogReact — three-tier CI/CD project

React/Vite frontend → nginx proxy → Express API → MySQL 8.4.

Live application: http://k8s-blogapp-blogappi-e8e48220b4-1416607124.ap-south-1.elb.amazonaws.com

Jenkins job `BlogReact-EKS-CI` verifies tests, SonarQube and Trivy gates, publishes versioned private ECR images, deploys to EKS, and checks the public application. Frontend and backend each run two replicas; MySQL uses a persistent EBS volume. Prometheus and Grafana collect live cluster and application metrics. Execution results and limitations are recorded in [docs/VALIDATION.md](docs/VALIDATION.md).

The owner selected the temporary HTTP load-balancer address for this demonstration. HTTPS with an owned domain and ACM certificate remains a separate configuration option. MySQL has one replica, so storage persists across restarts but database restarts can briefly interrupt API access. Use demonstration data and unique passwords.

## Local setup (Windows PowerShell)

Requirements: Docker Desktop with its Linux engine running. Node 22.12+ is needed only for host-based tests and smoke checks.

```powershell
# Run once. Existing credentials are deliberately not overwritten.
.\scripts\init-local-secrets.ps1

docker compose up --build -d
docker compose ps

$env:APP_URL = 'http://localhost:3000'
node scripts/smoke.mjs
```

Open http://localhost:3000. Register an account to publish a post. The initial database contains the schema and no shared demo login. Only the frontend is published on the host; backend and database ports stay private.

The ignored `.env` contains random local passwords and a JWT signing key. Keep it private. Changing this file does not change the password inside an existing MySQL volume; rotate the database account separately.

The container base images use the publishers' public ECR mirrors, avoiding dependence on a Docker Hub login. Application images built for deployment are published to your private ECR repositories.

## Tests and build

```powershell
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npm run lint --prefix backend
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
npm run validate
```

Backend tests cover registration/login, JWT authentication, post/comment operations, database failure handling, metrics and health checks using a mocked database. Frontend coverage applies to the API client, not the entire React UI. The separate smoke script verifies real frontend → API → database communication.

## Database persistence evidence

The following write-mode test creates an account, post and comment. Copy the printed post slug for the second check.

```powershell
$env:APP_URL = 'http://localhost:3000'
$env:SMOKE_WRITE = 'true'
node scripts/smoke.mjs
Remove-Item Env:\SMOKE_WRITE

# Recreate the container while retaining its named volume.
docker compose up -d --force-recreate mysql
# Wait for mysql and backend to become healthy: docker compose ps
$env:EVIDENCE_SLUG = 'paste-the-printed-slug-here'
node scripts/smoke.mjs
```

`docker compose down` stops/removes the containers and retains data. `docker compose down -v` deletes the database volume and its data; use only for an intentional reset. The initialization SQL runs only on the first empty data directory. Later schema changes require explicit, reviewed migrations.

## Logs and diagnostics

```powershell
docker compose logs --tail=100 frontend backend mysql
docker compose ps
```

Backend liveness `/healthz` checks the process. Readiness `/readyz` checks MySQL. `/metrics` exposes process/request metrics and database availability internally. nginx exposes `/healthz` and proxies `/api/`; database/metrics endpoints are not exposed by the frontend.

## Files for the cloud phase

- `Jenkinsfile`: checkout, locked dependency install, tests/build, SonarQube quality gate, image build, Trivy HIGH/CRITICAL gate, ECR publishing, EKS rollout and smoke validation. Optional Nexus raw release bundles are supported.
- `k8s/`: two frontend/backend replicas, rolling updates, probes, limits, HPA, disruption budgets, non-root execution, isolated MySQL StatefulSet and encrypted persistent storage. Namespace-scoped CI RBAC excludes direct Secret access.
- `infra/`: reviewable eksctl cluster configuration and a scoped CI IAM policy template. No cloud resources are created by local setup.
- `monitoring/`: Prometheus ServiceMonitor, alert rules, persistent monitoring values and a Grafana dashboard.
- `scripts/bootstrap-secrets.mjs`: generate cluster secrets in memory and create them using the intended Kubernetes context, without committing credentials.
- `docs/CLOUD-SETUP.md`: cloud prerequisites and deployment sequence.
- `docs/EVIDENCE.md`: submission evidence checklist.

The MySQL deployment is a single persistent database, not a high-availability database cluster. EBS volume retention is not a backup; configure tested backups before production use. Node-local rate limiting is per API replica. The current browser stores JWTs in local storage; review session hardening before handling sensitive production data.
