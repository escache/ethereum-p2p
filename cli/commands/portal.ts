import { execSync } from 'child_process';
import type { NexethConfig } from '../config/schema';

export function runPortalOpen(config: NexethConfig): number {
  const url = config.portalUrl;
  console.log(`\n  Opening portal: ${url}\n`);

  try {
    if (process.platform === 'darwin') {
      execSync(`open "${url}"`);
    } else if (process.platform === 'win32') {
      execSync(`start "${url}"`, { shell: 'cmd.exe' });
    } else {
      execSync(`xdg-open "${url}"`);
    }
    return 0;
  } catch {
    console.log(`  Could not open browser. Visit: ${url}\n`);
    return 0;
  }
}
