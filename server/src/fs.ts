import fs from 'node:fs/promises';
import path from 'node:path';
import type { FsEntry } from '@ciliterm/shared';

/** List a directory for the file browser panel. Sorted dirs-first, then name. */
export async function listDir(dir: string): Promise<{ path: string; entries: FsEntry[] }> {
  const abs = path.resolve(dir);
  const dirents = await fs.readdir(abs, { withFileTypes: true });

  const entries: FsEntry[] = await Promise.all(
    dirents.map(async (d) => {
      const full = path.join(abs, d.name);
      let size = 0;
      const isDir = d.isDirectory();
      if (!isDir) {
        try {
          size = (await fs.stat(full)).size;
        } catch {
          size = 0;
        }
      }
      return { name: d.name, isDir, size };
    }),
  );

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { path: abs, entries };
}
