import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
for (const path of ['src', 'public', 'deploy', 'package.json', 'package-lock.json', 'README.md', 'DECISIONS.md', '.env.example']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
console.log('Release files prepared in dist/ (no environment secrets or database).');
