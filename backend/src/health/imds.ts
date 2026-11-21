import { hostname } from 'os';

const IMDS_BASE = 'http://169.254.169.254';
const TIMEOUT_MS = 300;

export interface InstanceIdentity {
  instanceId: string;
  availabilityZone: string;
}

let cached: InstanceIdentity | null = null;

export async function lookupInstance(): Promise<InstanceIdentity> {
  if (cached) {
    return cached;
  }
  try {
    cached = await fetchImds();
  } catch {
    cached = { instanceId: hostname(), availabilityZone: 'local' };
  }
  return cached;
}

async function fetchImds(): Promise<InstanceIdentity> {
  const tokenResponse = await fetch(`${IMDS_BASE}/latest/api/token`, {
    method: 'PUT',
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!tokenResponse.ok) {
    throw new Error(`IMDS token status ${tokenResponse.status}`);
  }
  const token = (await tokenResponse.text()).trim();
  const headers = { 'X-aws-ec2-metadata-token': token };
  const [instanceId, availabilityZone] = await Promise.all([
    imdsText('/latest/meta-data/instance-id', headers),
    imdsText('/latest/meta-data/placement/availability-zone', headers),
  ]);
  if (!instanceId || !availabilityZone) {
    throw new Error('IMDS identity is empty');
  }
  return { instanceId, availabilityZone };
}

async function imdsText(path: string, headers: Record<string, string>): Promise<string> {
  const response = await fetch(`${IMDS_BASE}${path}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`IMDS ${path} status ${response.status}`);
  }
  return (await response.text()).trim();
}
