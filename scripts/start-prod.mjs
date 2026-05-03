import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const candidates = ['dist/src/main.js', 'dist/main.js'];
const resolvedEntry = candidates
  .map((candidate) => resolve(candidate))
  .find((candidate) => existsSync(candidate));

if (!resolvedEntry) {
  console.error(
    `No compiled production entrypoint found. Checked: ${candidates.join(', ')}`,
  );
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log(resolvedEntry);
  process.exit(0);
}

await import(pathToFileURL(resolvedEntry).href);
