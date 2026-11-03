# Cloud phase runbook

Local setup comes first. These commands are for a later, configured AWS environment; they have not been executed against EKS in this session.

## Architecture and prerequisites

Use Jenkins on a trusted Linux agent, private ECR image repositories and an EKS-managed MySQL StatefulSet. Nexus is an optional additional release-bundle store; ECR is the container registry. Confirm with the assessor if both registries are expected.

The agent needs Git, Node 22.12+, npm, Docker/buildx, AWS CLI v2, kubectl compatible with the cluster, Trivy and SonarScanner CLI on PATH. Bootstrap also needs Helm and eksctl. Give AWS access through an instance role or short-lived role credentials; do not put access keys into the Jenkinsfile.

Review `infra/eks-cluster.yaml` before provisioning. It creates private nodes, a private API endpoint, a NAT gateway and two t3.large nodes. Jenkins and the bootstrap administrator need network access inside the VPC (VPN, connected host or equivalent). This configuration creates billable AWS resources. Do not run it as part of local setup.

```sh
aws sts get-caller-identity
eksctl create cluster -f infra/eks-cluster.yaml
aws eks update-kubeconfig --name blogapp-eks --region ap-south-1
```

Install the EBS CSI add-on with its own IAM role, the AWS Load Balancer Controller with its own IAM role, and metrics-server. Verify private/public subnet discovery tags for the ALB. The VPC CNI configuration enables network-policy enforcement; verify it is active before relying on the database isolation policies.

Follow the maintained installation instructions:

- [AWS EBS CSI driver and IAM](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html)
- [AWS Load Balancer Controller with Helm](https://docs.aws.amazon.com/eks/latest/userguide/lbc-helm.html)
- [EKS network-policy configuration](https://docs.aws.amazon.com/eks/latest/userguide/cni-network-policy-configure.html)

## Bootstrap as an administrator

Create ECR repositories with immutable image tags and image scanning:

```sh
aws ecr create-repository --repository-name blogapp-backend --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true --region ap-south-1
aws ecr create-repository --repository-name blogapp-frontend --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true --region ap-south-1

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/storage.yaml
kubectl create namespace monitoring
KUBE_CONTEXT="$(kubectl config current-context)" node scripts/bootstrap-secrets.mjs
kubectl apply -f k8s/ci-rbac.yaml
```

The secret bootstrap refuses existing Secrets rather than silently rotating passwords. Back up secrets securely and define a rotation process. For an initialized MySQL database, update database account passwords as well as the Secret; changing only the Secret breaks access. Base64-encoded Kubernetes Secrets are not a substitute for access control or encryption at rest.

Replace REGION and ACCOUNT_ID in `infra/ci-iam-policy.json` and attach the policy to the CI role. Create an EKS access entry for that role, mapping it to Kubernetes group `blogapp-deployers`. The RoleBinding grants namespace-scoped deployment access. The role cannot directly read Secrets, but a principal that can change pod specifications is powerful and must remain trusted. ECR pull access belongs to the node role; add-on roles belong to their controllers, not to application pods.

## Monitoring

Install a reviewed version of kube-prometheus-stack and record the chart version used in the evidence document. Release name must be `monitoring` to match the ServiceMonitor and PrometheusRule labels.

```sh
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
# Set CHART_VERSION to the version reviewed for your EKS version.
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack --version "$CHART_VERSION" -n monitoring -f monitoring/values.yaml
kubectl apply -k monitoring
kubectl -n monitoring port-forward svc/monitoring-grafana 3001:80
```

Grafana uses the precreated `grafana-admin` Secret. Obtain its password using an authorized administrative session; do not include it in screenshots or logs. Prometheus and Grafana remain ClusterIP services. The dashboard covers CPU, memory, pod phases, restarts, node readiness, database connectivity, request rate and latency. Default stack dashboards and alerts add cluster-level visibility.

## Configure Jenkins and SonarQube

Use a Multibranch Pipeline pointed at the repository containing this Jenkinsfile. Set a GitHub webhook to trigger branch builds on pushes. Set a trusted `blogapp-linux` agent label and restrict this credential-bearing deployment job to trusted repository maintainers. PR builds must not receive AWS deployment credentials or run on a privileged deployment agent; configure a separate isolated validation job for untrusted PRs.

Install Pipeline, Git, Credentials Binding and SonarQube Scanner for Jenkins plugins. Configure a SonarQube server named `sonarqube-server` with a project-scoped analysis token. Create project key `blogapp`, configure its Quality Gate and configure the webhook to `https://JENKINS_HOST/sonarqube-webhook/` (including the trailing slash). The pipeline blocks image publication/deployment when the gate fails.

The agent runs `sonar-scanner`; install the CLI independently on PATH. Test reports are generated before analysis. Backend coverage spans backend source; frontend coverage currently measures the API client only. SonarQube evaluates the broader source tree, so a strict whole-project coverage gate may fail until UI tests are added. A failed gate must be fixed, not bypassed.

References: [Jenkins SonarQube steps and webhook](https://www.jenkins.io/doc/pipeline/steps/sonar/), [SonarScanner CLI](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner).

Set pipeline parameters for region, cluster name, ECR registry, HTTPS APP_URL, DNS hostname and issued ACM certificate ARN. The certificate must match the hostname and be in the ALB region. The domain must resolve to the resulting ALB using an appropriate DNS alias/CNAME. DNS setup is a bootstrap action outside the application pipeline. Configure this before requiring an initial URL smoke check to pass.

Optional Nexus: create a raw hosted repository and scoped `nexus-creds` Jenkins credential; set HTTPS NEXUS_RAW_URL and enable PUBLISH_NEXUS. The bundle excludes node_modules, build output, coverage and ignored local secret files. Nexus is not required to store images when ECR is selected.

## Deployment, validation and rollback

The pipeline tags both images with BUILD_NUMBER plus commit SHA, scans both with Trivy, and publishes only after both gates pass. Any HIGH/CRITICAL finding blocks publishing, including unfixed findings. Scan reports are archived even when the gate fails. Refresh vulnerable base images or dependencies and rerun the pipeline; do not silently ignore findings.

The release renderer uses the same version tag for both deployments. Namespace and StorageClass are excluded from CI deployment because they are bootstrapped by the administrator. Secrets and monitoring CRDs are provisioned separately. The pipeline performs server-side dry-run validation, applies resources, waits for database/backend/frontend rollout and checks the public frontend/API/database path. It does not create AWS infrastructure.

For persistence evidence, run `SMOKE_WRITE=true APP_URL=https://YOUR_HOST node scripts/smoke.mjs`, record the returned evidence slug, then as administrator:

```sh
kubectl delete pod mysql-0 -n blogapp
kubectl rollout status statefulset/mysql -n blogapp --timeout=600s
EVIDENCE_SLUG=RECORDED_SLUG APP_URL=https://YOUR_HOST node scripts/smoke.mjs
```

For deployment/logging evidence:

```sh
kubectl get pods,svc,ingress,pvc,hpa -n blogapp
kubectl get events -n blogapp --sort-by=.metadata.creationTimestamp
kubectl logs -n blogapp -l app=frontend --all-containers --prefix --tail=100
kubectl logs -n blogapp -l app=backend --all-containers --prefix --tail=100
kubectl logs -n blogapp mysql-0 --tail=100
kubectl rollout history deployment/backend -n blogapp
```

Record the previous healthy revision before deployment. If a rollout fails, inspect events/logs and roll back both application deployments to the corresponding healthy release with `kubectl rollout undo ... --to-revision=REVISION`, then wait for both rollouts and rerun smoke validation. Kubernetes rolling updates preserve old ready pods where possible; rollback is an operator action in this implementation. Schema changes need a separate backwards-compatible migration and rollback plan.

MySQL is single-instance, so it has downtime during recreation. EBS is tied to an availability zone, and the retained volume must be managed deliberately. Implement snapshots/logical backups and test restore before production. The submitted proof should distinguish availability of the frontend/backend from database high availability.
