FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM public.ecr.aws/nginx/nginx-unprivileged:stable-alpine AS runtime
USER root
# Apply the vendor's security fix until the base image includes it.
RUN apk upgrade --no-cache libexpat
ENV BACKEND_HOST=backend-service BACKEND_PORT=5000
COPY --from=build /app/dist /usr/share/nginx/html
COPY default.conf.template /etc/nginx/templates/default.conf.template
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
