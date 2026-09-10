import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const suspiciousFile = file => /(^|\/)(\.env(?:\..+)?|credentials\.json|service-?account\.json|serviceAccount\.json|firebase-adminsdk[^/]*\.json)$/.test(file) && !file.endsWith('.env.example') || /\.(?:pem|key|p12|pfx|db|sqlite3?|db-journal|db-wal|db-shm)$/.test(file);
const textFile = file => /\.(?:js|mjs|cjs|ts|tsx|json|html|css|md|prisma|sql|ya?ml|toml|txt)$/.test(file) || /(?:^|\/)(?:\.env(?:\..*)?|\.gitignore)$/.test(file);
const patterns = [
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['Google credential', /\b(?:AIza[A-Za-z0-9_-]{30,}|GOCSPX-[A-Za-z0-9_-]{20,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Provider token', /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,})\b/],
  ['Bearer token', /\bBearer\s+[A-Za-z0-9_+./=-]{24,}/],
  ['Password in database URL', /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/],
];
const placeholder = value => !value || /^(?:YOUR_[A-Z_]+|your_[a-z_]+|placeholder|test-only|undefined|null)$/i.test(value);
let findings = 0;
function report(file, line, category) { findings++; console.error(`${file}:${line} — ${category}`); }
export function scanText(file, content) {
  content.split(/\r?\n/).forEach((line, index) => {
    for (const [category, pattern] of patterns) if (pattern.test(line)) report(file, index + 1, category);
    const assignment = line.match(/\b(?:[A-Z_]*API_(?:SECRET|KEY)|JWT_SECRET|SESSION_SECRET|GOOGLE_CLIENT_SECRET|AWS_SECRET_ACCESS_KEY|SMS_API_SECRET)\b["']?\s*[:=]\s*(.*)/);
    if (!assignment) return;
    const raw = assignment[1].trim();
    if (/\.(?:m?js|ts)$/.test(file) && /process\.env\./.test(line) && /^\w+\s*;?$/.test(raw)) return; // Variable reference, not a literal.
    // Expressions read backend configuration or generate runtime-only secrets.
    if (/^(?:process\.env\.|crypto\.|`|\$\{)/.test(raw)) return;
    const literal = raw.match(/^["']([^"']*)["']/)?.[1] ?? raw.replace(/[,;].*$/, '').trim();
    if (!placeholder(literal)) report(file, index + 1, 'Hard-coded secret assignment');
  });
}
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const files = [...new Set([...tracked, ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)])];
for (const file of files) {
  if (suspiciousFile(file)) { report(file, 1, 'Sensitive file in source tree'); continue; }
  if (!textFile(file)) continue;
  try { scanText(file, readFileSync(file, 'utf8')); } catch { /* deleted working-tree file */ }
}
if (process.argv.includes('--history')) {
  const objects = git(['rev-list', '--objects', '--all']).trim().split('\n');
  for (const entry of objects) {
    const split = entry.indexOf(' ');
    if (split === -1) continue;
    const hash = entry.slice(0, split), file = entry.slice(split + 1);
    if (suspiciousFile(file)) { report(`history:${file}`, 1, 'Sensitive file in Git history'); continue; }
    if (!textFile(file)) continue;
    try { if (Number(git(['cat-file', '-s', hash])) <= 5000000) scanText(`history:${file}`, git(['cat-file', '-p', hash])); } catch { /* trees are not source files */ }
  }
}
if (findings) { console.error(`${findings} potential secret finding(s). Values withheld.`); process.exitCode = 1; }
else console.log(`Secret checks passed for ${files.length} source files${process.argv.includes('--history') ? ' and reachable Git history' : ''}. No credential values printed.`);
