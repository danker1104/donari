// @ts-check

import path from 'node:path';
import process from 'node:process';
import { listDistEntries, validateDistEntries } from './lib/dist-validation.mjs';

const DIST_ROOT = path.join(process.cwd(), 'dist');
const BUDGET_BYTES = 35 * 1024 * 1024;

try {
  const report = validateDistEntries(await listDistEntries(DIST_ROOT), BUDGET_BYTES);
  console.log(`Validated dist: ${report.totalBytes} / ${report.budgetBytes} bytes.`);
  for (const [role, bytes] of Object.entries(report.byRole).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${role}: ${bytes} bytes`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
