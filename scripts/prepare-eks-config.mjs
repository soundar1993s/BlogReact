import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { parse, stringify } from 'yaml';

const cidr = process.env.ADMIN_PUBLIC_CIDR || '';
const [address, prefix] = cidr.split('/');
if (isIP(address) !== 4 || prefix !== '32') throw new Error('Set ADMIN_PUBLIC_CIDR to your current public IPv4 address followed by /32');
const destination = '.secrets/eks-cluster.local.yaml';
if (existsSync(destination)) throw new Error('Local cluster configuration exists; review it instead of overwriting it');
const config = parse(readFileSync('infra/eks-cluster.yaml', 'utf8'));
config.metadata.version = '1.37';
config.vpc.clusterEndpoints = { publicAccess: true, privateAccess: true };
config.vpc.publicAccessCIDRs = [cidr];
mkdirSync('.secrets', { recursive: true });
writeFileSync(destination, stringify(config), { mode: 0o600 });
console.log(`Prepared ${destination}; no AWS resources created. Review it and run eksctl dry-run before provisioning.`);
