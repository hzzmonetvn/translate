import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/store.js';

const password = randomBytes(18).toString('base64url');
console.log(`Password: ${password}\nADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
