import { createServer } from 'node:http';
import handler from '../api/index.js';
const server = createServer(handler);
server.listen(0, '127.0.0.1', () => console.log(`Cloud test port ${server.address().port}`));
