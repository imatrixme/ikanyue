import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.cwd(), 'dist');

rmSync(outputDirectory, { force: true, recursive: true });
console.log(`Cleared ${outputDirectory}`);
