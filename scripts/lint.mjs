// Lightweight banned-pattern lint for the redesign (plan section 8.2).
// Runs as `npm run lint`; the repo has no ESLint configuration.
import { execFileSync } from 'node:child_process';

const fails = [];

function check(name, cmd) {
  try {
    const out = execFileSync('bash', ['-c', cmd], { encoding: 'utf8' });
    if (out.trim()) fails.push(`[${name}]\n${out.trim()}`);
  } catch (e) {
    if (e.status !== 1) fails.push(`[${name}] command error: ${e.message}`);
  }
}

check('gradients/glow', "grep -RInE 'gradient|drop-shadow' styles components app lib/copy.ts --include=*.css --include=*.tsx --include=*.ts | grep -v 'components/Studio.tsx' | grep -v 'app/globals.css' || true");
check('glass', "grep -RIn 'backdrop-filter' styles components app | grep -v 'components/Studio.tsx' | grep -v 'app/globals.css' || true");
check('uppercase labels', "grep -RInE 'text-transform: *uppercase' styles components app --include=*.css | grep -v 'app/globals.css' || true");
check('arrows in copy', "grep -RIn '→' lib/copy.ts || true");
check('emoji in product code', "grep -RIlP '[\\x{1F300}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{2B50}\\x{2B1B}\\x{2B1C}]' lib components app 2>/dev/null | grep -v 'components/Studio.tsx' || true");
check('hard-coded colours in new code', "grep -RInE '#[0-9a-fA-F]{3,8}\\b|rgba?\\(' components/ui components/shell components/ask components/run components/results components/library components/settings app/library app/settings app/sample app/dev app/research --include=*.css --include=*.tsx --include=*.ts || true");
// style={{}} is allowed only for dynamic widths / computed positions (plan 8.2).
const DYNAMIC_WIDTH_FILES = new Set([
  'components/ui/ProgressBar.tsx',
  'components/ui/Skeleton.tsx',
  'components/ui/SourceIcon.tsx',
  'components/ui/Popover.tsx',
  'components/ui/Drawer.tsx',
  'components/ui/SettingPopover.tsx',
]);
check('inline styles in components', "grep -RIn 'style={{' components/ui components/shell components/ask components/run components/results components/library components/settings | grep -vE '(ProgressBar|Skeleton|SourceIcon|Popover|Drawer|SettingPopover)\.(tsx)' || true");
check('TODO/console.log in new code', "grep -RInE 'TODO|console\\.log' lib/client lib/copy.ts components/ui components/shell components/ask components/run components/results components/library components/settings app/research app/library app/settings app/sample app/dev || true");

if (fails.length) {
  console.error(fails.join('\n\n'));
  process.exit(1);
}
console.log('lint: no banned patterns found');
