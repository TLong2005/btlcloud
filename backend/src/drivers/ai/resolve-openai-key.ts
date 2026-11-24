import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export async function resolveOpenAiApiKey(options: {
  apiKey: string | null;
  secretArn: string | null;
  awsRegion: string;
}): Promise<string | null> {
  if (!options.secretArn) {
    return options.apiKey;
  }
  const client = new SecretsManagerClient({ region: options.awsRegion });
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: options.secretArn }),
  );
  if (!result.SecretString) {
    throw new Error('OpenAI secret has no SecretString');
  }
  return apiKeyFromSecret(result.SecretString);
}

function apiKeyFromSecret(secret: string): string | null {
  const trimmed = secret.trim();
  if (!trimmed || trimmed === 'replace-me') {
    return null;
  }
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error('OpenAI secret JSON is invalid');
  }
  const key = parsed.apiKey ?? parsed.OPENAI_API_KEY ?? parsed.api_key;
  if (typeof key !== 'string') {
    return null;
  }
  const value = key.trim();
  if (!value || value === 'replace-me') {
    return null;
  }
  return value;
}
