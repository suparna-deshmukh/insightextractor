import fs from 'fs';
import path from 'path';

const runtimeKeys: Record<string, string> = {};

export function getKey(name: string): string {
  return process.env[name] || runtimeKeys[name] || '';
}

export function setKey(name: string, value: string): void {
  if (!value) return;
  process.env[name] = value;
  runtimeKeys[name] = value;
  try {
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
