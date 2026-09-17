import { cloudSetupIssues } from '../backend/deployment.js';

let application;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (cloudSetupIssues().length) {
    const config = new URL(req.url, 'https://railgo.invalid').pathname === '/api/auth/config';
    res.statusCode = config ? 200 : 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(config ? { configured: false, pending: null } : { error: 'Email login setup is incomplete. Configure the database and email service in Vercel, then redeploy.' }));
  }
  try {
    application ||= import('../server.js').then(module => module.app);
    return (await application)(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The login service could not start. Please retry shortly.' }));
  }
}
