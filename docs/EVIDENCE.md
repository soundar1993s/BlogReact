# Execution evidence checklist

Record actual outputs and screenshots. Configuration files are implementation artifacts, not proof that a deployment ran. Do not capture tokens, passwords, environment files or Secret YAML.

Submission links:

- GitHub repository: pending push to your authorized repository.
- Execution document: this checklist plus collected screenshots/results.
- Application URL: local http://localhost:3000; public EKS URL pending cloud phase.

| Requirement | Implementation | Evidence to capture |
|---|---|---|
| Three-tier application | frontend/, backend/, database/ | Registration, login, new post and comment in the UI; successful smoke test |
| Docker | Both Dockerfiles and .dockerignore files | Successful image build, health status, non-root user inspection |
| Persistent database | Compose named volume; EKS MySQL StatefulSet/PVC | Same evidence post/comment before and after database container/pod recreation |
| Registry | Jenkins ECR publish stage | Both immutable version tags, digests and corresponding Kubernetes image references |
| SonarQube | sonar-project.properties, Quality Gate stage | Analysis dashboard plus a gate failure that stops publication/deployment |
| Trivy | Security Gate stage | Archived JSON reports for both images; a blocked pipeline on HIGH/CRITICAL findings |
| EKS | k8s/ | Pods/services/PVC/ingress, working HTTPS URL and component connectivity |
| Reliability | Replicas, probes, rolling strategy, PDB, HPA | New commit rollout, old/new replica transitions, request availability during rollout |
| Configuration/secrets | ConfigMap and out-of-Git secret bootstrap | ConfigMap and Secret names/references only; no secret values |
| Automated CI/CD | Jenkinsfile and GitHub webhook | Commit SHA → triggered pipeline → matching deployed image version |
| Monitoring | monitoring/ | Prometheus targets and populated Grafana panels |
| Logging | stdout/stderr and Kubernetes logs | Frontend/backend/database logs and a diagnosed failure |
| Security | IAM template, CI RBAC, network policies, security contexts | Scoped policy, RBAC checks and failed database connection from a non-backend workload |

Local tests do not prove EKS network-policy enforcement, AWS IAM behavior, ALB TLS, SonarQube gates, Trivy scans or populated cloud dashboards. Collect those during the cloud phase.
