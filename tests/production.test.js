import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
test('production requires a strong signing secret', () => {
  for (const secret of ['', 'short', crypto.randomBytes(48).toString('base64url')]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "const {authMiddleware}=await import('./backend/auth.js'); authMiddleware();"], {
      env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: secret, JWT_SECRET: secret, DOTENV_CONFIG_PATH: 'nonexistent' }, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status === 0, secret.length >= 32);
  }
});
