import { readFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
const template = readFileSync(new URL('../k8s/ingress.yaml', import.meta.url), 'utf8');
// Explicit lab mode uses the ALB DNS name without an owned domain or certificate.
// HTTPS remains the default for deployments with DNS and an issued certificate.
if (process.env.HTTP_DEMO === 'true') {
  const ingress = parse(template);
  delete ingress.metadata.annotations['alb.ingress.kubernetes.io/ssl-redirect'];
  delete ingress.metadata.annotations['alb.ingress.kubernetes.io/certificate-arn'];
  ingress.metadata.annotations['alb.ingress.kubernetes.io/listen-ports'] = '[{"HTTP":80}]';
  delete ingress.spec.rules[0].host;
  process.stdout.write(stringify(ingress));
  process.exit(0);
}
const { DOMAIN_NAME, ACM_CERTIFICATE_ARN } = process.env;
if (!DOMAIN_NAME || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(DOMAIN_NAME)) {
  throw new Error('Set DOMAIN_NAME to your application DNS hostname');
}
if (!/^arn:aws:acm:[a-z0-9-]+:\d{12}:certificate\/[a-f0-9-]+$/.test(ACM_CERTIFICATE_ARN || '')) {
  throw new Error('Set ACM_CERTIFICATE_ARN to an issued ACM certificate in the ALB region');
}
process.stdout.write(template.replaceAll('${DOMAIN_NAME}', DOMAIN_NAME).replaceAll('${ACM_CERTIFICATE_ARN}', ACM_CERTIFICATE_ARN));
