// @ts-check

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_PATHS = [
  'index.html',
  'content-report.json',
  'catalog/v1/catalog.json',
  'content/v2/silhouette/manifest.json',
  'skins/v3/yugen/manifest.json',
];

const ALLOWED_ROOTS = new Set(['assets', 'catalog', 'content', 'skins']);
const FORBIDDEN_NAMES = new Set(['desktop.ini', 'thumbs.db']);

/** @param {string} directory @param {string} [relative] */
export async function listDistEntries(directory, relative = '') {
  /** @type {{path: string, bytes: number}[]} */
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listDistEntries(child, childRelative)));
    else if (entry.isFile()) files.push({ path: childRelative, bytes: (await stat(child)).size });
  }
  return files;
}

/** @param {string} filePath */
function roleFor(filePath) {
  const root = filePath.split('/')[0];
  if (root === 'catalog') return 'catalog';
  if (root === 'content') return 'content';
  if (root === 'skins') return 'skin';
  if (filePath === 'content-report.json') return 'report';
  return 'app';
}

/**
 * @param {{path: string, bytes: number}[]} entries
 * @param {number} budgetBytes
 */
export function validateDistEntries(entries, budgetBytes) {
  const paths = new Set(entries.map((entry) => entry.path));
  for (const required of REQUIRED_PATHS) {
    if (!paths.has(required)) throw new Error(`DIST_REQUIRED_PATH_MISSING: ${required}`);
  }

  /** @type {Record<string, number>} */
  const byRole = {};
  let totalBytes = 0;
  for (const entry of entries) {
    const normalized = entry.path.replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (FORBIDDEN_NAMES.has(segments.at(-1)?.toLocaleLowerCase('en-US') ?? '')) {
      throw new Error(`DIST_FORBIDDEN_FILE: ${normalized}`);
    }
    if (segments.length > 1 && !ALLOWED_ROOTS.has(segments[0])) {
      throw new Error(`DIST_PATH_NOT_ALLOWLISTED: ${normalized}`);
    }
    if (segments.length === 1 && !['index.html', 'content-report.json'].includes(normalized)) {
      throw new Error(`DIST_PATH_NOT_ALLOWLISTED: ${normalized}`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`DIST_SIZE_INVALID: ${normalized}`);
    }
    const role = roleFor(normalized);
    byRole[role] = (byRole[role] ?? 0) + entry.bytes;
    totalBytes += entry.bytes;
  }

  if (totalBytes > budgetBytes) {
    throw new Error(`DIST_BUDGET_EXCEEDED: ${totalBytes} > ${budgetBytes}`);
  }

  return { totalBytes, budgetBytes, byRole };
}
