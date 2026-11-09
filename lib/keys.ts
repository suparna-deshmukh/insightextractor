import fs from 'fs';
import path from 'path';
import { storeGetJson, storeSetJson } from './store';

const STORED_KEY = 'ie:keys';
const runtimeKeys: Record<string, string> = {};

export function getKey(name: string): string {
  return process.env[name] || runtimeKeys[name] || '';
}

/**
 * Pull keys saved through the settings UI (shared KV store) into process.env
 * on cold instances so every instance sees them. Real environment variables
 * (Vercel console) always win over stored ones.
 */
export async function hydrateStoredKeys(): Promise<void> {
  const stored = await storeGetJson<Record<string, string>>(STORED_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
  for (const [name, value] of Object.entries(stored)) {
    if (typeof value === 'string' && value && !process.env[name] && !runtimeKeys[name]) {
      process.env[name] = value;
      runtimeKeys[name] = value;
    }
  }
}

export async function setKey(name: string, value: string): Promise<void> {
  if (!value) return;
  process.env[name] = value;
  runtimeKeys[name] = value;
  try {
    const stored = (await storeGetJson<Record<string, string>>(STORED_KEY)) ?? {};
    stored[name] = value;
    await storeSetJson(STORED_KEY, stored);
  } catch {
    // best effort: keep in-process only
  }
  try {
    // Local dev only: keep a .env.local copy so keys survive restarts.
    const envPath = path.join(process.cwd(), '.env.local');
    let content = '';
    if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
    const line = `${name}=${value}`;
    const lines = content.split('\n').filter((l) => !l.startsWith(`${name}=`));
    lines.push(line);
    fs.writeFileSync(envPath, lines.join('\n') + (content.endsWith('\n') ? '' : '\n'));
  } catch {
    // best effort: keep in-process only
  }
}
