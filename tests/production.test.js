import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

test('production never enables development OTP or Google bypass', () => {
  const env = { ...process.env, NODE_ENV: 'production', DEV_OTP_MODE: 'true', DEV_GOOGLE_AUTH: 'true', SESSION_SECRET: crypto.randomBytes(48).toString('base64url') };
  const rejected = spawnSync(process.execPath, ['--input-type=module', '-e', "try { await import('./server.js'); process.exitCode=1; } catch { console.log('production startup rejected'); }"], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(rejected.status, 0); assert.match(rejected.stdout, /production startup rejected/);
  env.DEV_OTP_MODE = 'false'; env.DEV_GOOGLE_AUTH = 'false';
  env.SMS_PROVIDER = ''; // Never send real SMS from a regression test.
  const checked = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const {app}=await import('./server.js');
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const config=await (await fetch(base+'/api/auth/config')).json();
    const otp=await fetch(base+'/api/auth/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mobileNumber:'9876543210'})});
    console.log(JSON.stringify({config,otpStatus:otp.status}));
    server.closeAllConnections();server.close();
  `], { env, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(checked.status, 0);
  const result = JSON.parse(checked.stdout.trim());
  assert.equal(result.config.devOtp, false); assert.equal(result.config.devGoogle, false); assert.equal(result.otpStatus, 503);
});
