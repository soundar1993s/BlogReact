pipeline {
  agent { label 'blogapp-linux' }
  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    skipDefaultCheckout(true)
  }
  parameters {
    string(name: 'AWS_REGION', defaultValue: 'ap-south-1', description: 'EKS and ECR region')
    string(name: 'EKS_CLUSTER', defaultValue: 'blogapp-eks', description: 'Existing EKS cluster')
    string(name: 'ECR_REGISTRY', defaultValue: '', description: 'ACCOUNT.dkr.ecr.REGION.amazonaws.com')
    string(name: 'APP_URL', defaultValue: '', description: 'HTTPS URL for post-deploy validation')
    string(name: 'DOMAIN_NAME', defaultValue: '', description: 'Application DNS hostname')
    string(name: 'ACM_CERTIFICATE_ARN', defaultValue: '', description: 'Issued certificate ARN')
    string(name: 'DEPLOY_BRANCH', defaultValue: 'main', description: 'Only this trusted branch can publish and deploy')
    booleanParam(name: 'PUBLISH_NEXUS', defaultValue: false, description: 'Also upload a release bundle to a Nexus raw hosted repository')
    string(name: 'NEXUS_RAW_URL', defaultValue: '', description: 'https://nexus.example.com/repository/blogapp-releases')
  }
  environment {
    AWS_DEFAULT_REGION = "${params.AWS_REGION}"
    ECR_REGISTRY = "${params.ECR_REGISTRY}"
    DOMAIN_NAME = "${params.DOMAIN_NAME}"
    ACM_CERTIFICATE_ARN = "${params.ACM_CERTIFICATE_ARN}"
    APP_URL = "${params.APP_URL}"
    DOCKER_CONFIG = "${WORKSPACE}/.docker-ci"
    KUBECONFIG = "${WORKSPACE}/.kube-ci/config"
  }
  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.IMAGE_TAG = "${env.BUILD_NUMBER}-${sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()}"
        }
        sh 'mkdir -p reports'
      }
    }
    stage('Install, Test and Build') {
      steps {
        sh '''
          set -eu
          npm ci
          npm ci --prefix backend
          npm ci --prefix frontend
          npm run lint --prefix backend
          npm test --prefix backend
          npm test --prefix frontend
          npm run build --prefix frontend
          npm run validate
        '''
      }
    }
    stage('SonarQube Analysis') {
      steps {
        withSonarQubeEnv('sonarqube-server') {
          sh 'export SONAR_TOKEN="$SONAR_AUTH_TOKEN"; sonar-scanner'
        }
      }
    }
    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }
    stage('Docker Build') {
      steps {
        sh '''
          set -eu
          docker build --pull -t blogapp-backend:$IMAGE_TAG backend
          docker build --pull -t blogapp-frontend:$IMAGE_TAG frontend
        '''
      }
    }
    stage('Trivy Security Gate') {
      steps {
        sh '''
          set -eu
          failed=0
          for component in backend frontend; do
            trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format json \
              --output reports/trivy-$component.json blogapp-$component:$IMAGE_TAG || failed=1
          done
          exit "$failed"
        '''
      }
    }
    stage('Publish ECR') {
      when { allOf { branch params.DEPLOY_BRANCH; not { changeRequest() } } }
      steps {
        sh '''
          set -eu
          node scripts/render-release.mjs > /dev/null
          aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY"
          for component in backend frontend; do
            docker tag blogapp-$component:$IMAGE_TAG "$ECR_REGISTRY/blogapp-$component:$IMAGE_TAG"
            docker push "$ECR_REGISTRY/blogapp-$component:$IMAGE_TAG"
          done
        '''
      }
    }
    stage('Nexus Release Bundle') {
      when { allOf { branch params.DEPLOY_BRANCH; not { changeRequest() }; expression { params.PUBLISH_NEXUS } } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'nexus-creds', usernameVariable: 'NEXUS_USER', passwordVariable: 'NEXUS_PASSWORD')]) {
          withEnv(["NEXUS_RAW_URL=${params.NEXUS_RAW_URL}"]) {
            sh '''
              set -eu
              case "$NEXUS_RAW_URL" in https://*) ;; *) echo 'Nexus must use HTTPS'; exit 1;; esac
              tar -czf reports/blogapp-$IMAGE_TAG.tar.gz --exclude=node_modules --exclude=coverage --exclude=dist --exclude=.env --exclude='.env.*' --exclude=.secrets frontend backend database k8s monitoring scripts Jenkinsfile
              curl --fail --silent --show-error --user "$NEXUS_USER:$NEXUS_PASSWORD" \
                --upload-file reports/blogapp-$IMAGE_TAG.tar.gz "$NEXUS_RAW_URL/$IMAGE_TAG/source.tar.gz"
            '''
          }
        }
      }
    }
    stage('Deploy EKS') {
      when { allOf { branch params.DEPLOY_BRANCH; not { changeRequest() } } }
      steps {
        withEnv(["EKS_CLUSTER=${params.EKS_CLUSTER}"]) {
          sh '''
            set -eu
            mkdir -p .kube-ci
            aws eks update-kubeconfig --name "$EKS_CLUSTER"
            node scripts/render-release.mjs > reports/release.yaml
            node scripts/render-ingress.mjs > reports/ingress.yaml
            kubectl apply --dry-run=server -f reports/release.yaml
            kubectl apply --dry-run=server -f reports/ingress.yaml
            kubectl apply -f reports/release.yaml
            kubectl rollout status statefulset/mysql -n blogapp --timeout=600s
            kubectl rollout status deployment/backend -n blogapp --timeout=300s
            kubectl rollout status deployment/frontend -n blogapp --timeout=300s
            kubectl apply -f reports/ingress.yaml
          '''
        }
      }
    }
    stage('Deployment Validation') {
      when { allOf { branch params.DEPLOY_BRANCH; not { changeRequest() } } }
      steps {
        retry(5) { sh 'node scripts/smoke.mjs' }
        sh 'kubectl get pods,svc,ingress,pvc -n blogapp -o wide > reports/workloads.txt'
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'reports/**,backend/coverage/lcov.info,frontend/coverage/lcov.info', allowEmptyArchive: true
      sh 'rm -rf -- .docker-ci .kube-ci .scannerwork'
    }
  }
}
