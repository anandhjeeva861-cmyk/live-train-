import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { configureHostedFrontend, backendOrigin } from '../scripts/hosting-config.js';

test('hosted login requires a public backend and exports no secrets', async () => {
  for (const value of ['http://localhost:4173', 'https://user:pass@backend.test', 'https://backend.test/path', 'https://backend.test/?key=secret', 'not a url']) {
    assert.throws(() => backendOrigin(value), /RAILGO_BACKEND_URL/);
  }
  await mkdir('test-results', { recursive: true });
  const output = pathToFileURL(path.resolve(await mkdtemp('test-results/hosting-')) + path.sep);
  await assert.rejects(configureHostedFrontend(output, { RAILGO_REQUIRE_EMAIL_LOGIN: 'true' }), /requires RAILGO_BACKEND_URL/);
  await configureHostedFrontend(output, { RAILGO_BACKEND_URL: ' https://backend.example.test/ ', RESEND_API_KEY: 'test-only' });
  const config = await readFile(new URL('config.js', output), 'utf8');
  assert.match(config, /"apiBase":"https:\/\/backend.example.test"/);
  assert.equal(config.includes('RESEND_API_KEY'), false);
  assert.equal(config.includes('test-only'), false);
});
