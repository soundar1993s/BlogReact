FROM node:24-bookworm-slim AS node_tools
FROM docker:29-cli AS docker_tools
FROM aquasec/trivy:0.76.1 AS trivy_tools
FROM sonarsource/sonar-scanner-cli:latest AS sonar_tools
FROM public.ecr.aws/aws-cli/aws-cli:2.37.13 AS aws_tools

FROM jenkins/inbound-agent:jdk21

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl git unzip libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node_tools /usr/local/ /usr/local/
COPY --from=docker_tools /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker_tools /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
COPY --from=trivy_tools /usr/local/bin/trivy /usr/local/bin/trivy
COPY --from=sonar_tools /opt/sonar-scanner /opt/sonar-scanner
COPY --from=aws_tools /usr/local/aws-cli /usr/local/aws-cli
RUN ln -s /usr/local/aws-cli/v2/current/bin/aws /usr/local/bin/aws

ARG TARGETARCH
RUN set -eux; \
    kubectl_version="$(curl -fsSL https://dl.k8s.io/release/stable.txt)"; \
    curl -fsSL "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${TARGETARCH}/kubectl" -o /usr/local/bin/kubectl; \
    curl -fsSL "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${TARGETARCH}/kubectl.sha256" -o /tmp/kubectl.sha256; \
    echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum --check; \
    chmod 755 /usr/local/bin/kubectl; \
    rm /tmp/kubectl.sha256

ENV PATH="/opt/sonar-scanner/bin:${PATH}"
ENV SONAR_USER_HOME="/home/jenkins/.sonar"

RUN mkdir -p /home/jenkins/.sonar \
    && chown jenkins:jenkins /home/jenkins/.sonar

USER jenkins

RUN java -version \
    && node --version \
    && npm --version \
    && docker --version \
    && docker buildx version \
    && trivy --version \
    && kubectl version --client \
    && aws --version \
    && sonar-scanner --version
