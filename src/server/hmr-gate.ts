/**
 * Shared HMR gate — tracks which files are currently being generated
 * so the Vite plugin can suppress HMR for them.
 */

const generatingFiles = new Set<string>();

export function suppressHmr(filePath: string): void {
  generatingFiles.add(filePath);
}

export function releaseHmr(filePath: string): void {
  generatingFiles.delete(filePath);
}

export function isHmrSuppressed(filePath: string): boolean {
  return generatingFiles.has(filePath);
}
