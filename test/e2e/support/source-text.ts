import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The text of the string constant `name`, exported by the module at `path`
 * (relative to the repository root), read from that module's source.
 *
 * For a case that must wait on a sentence the application draws without copying
 * it into the case: a module of `src/ui/` cannot be imported by the end-to-end
 * suites, whose `tsconfig.node.json` has no DOM library and which those modules
 * need. Throws when the constant is not found, so a rename fails the case on the
 * spot and does not leave it waiting on nothing.
 */
export function constantText(path: string, name: string): string {
  const source = readFileSync(join(repositoryRoot, path), 'utf8');
  const found = new RegExp(`export const ${name} = '([^']*)';`).exec(source);
  if (found?.[1] === undefined) {
    throw new Error(`${path} has no exported string constant ${name}`);
  }
  return found[1];
}
