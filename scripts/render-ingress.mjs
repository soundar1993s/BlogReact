import { readFileSync } from 'node:fs';
const { DOMAIN_NAME, ACM_CERTIFICATE_ARN } = process.env;
if (!DOMAIN_NAME || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(DOMAIN_NAME)) {
  throw new Error('Set DOMAIN_NAME to your application DNS hostname');
}
if (!/^arn:aws:acm:[a-z0-9-]+:\d{12}:certificate\/[a-f0-9-]+$/.test(ACM_CERTIFICATE_ARN || '')) {
  throw new Error('Set ACM_CERTIFICATE_ARN to an issued ACM certificate in the ALB region');
}
const template = readFileSync(new URL('../k8s/ingress.yaml', import.meta.url), 'utf8');
process.stdout.write(template.replaceAll('${DOMAIN_NAME}', DOMAIN_NAME).replaceAll('${ACM_CERTIFICATE_ARN}', ACM_CERTIFICATE_ARN));
