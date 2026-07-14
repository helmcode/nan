import { dev, type AstroInlineConfig } from 'astro';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type DevServer = Awaited<ReturnType<typeof dev>>;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface DocsApiServer {
  baseUrl: string;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => Promise<void>;
}

export async function startDocsApiServer(): Promise<DocsApiServer> {
  const config: AstroInlineConfig = {
    root: projectRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  };
  const server: DevServer = await dev(config);
  const address = server.address;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    fetch: (p: string, init?: RequestInit) => fetch(`${baseUrl}${p}`, init),
    stop: () => server.stop(),
  };
}
