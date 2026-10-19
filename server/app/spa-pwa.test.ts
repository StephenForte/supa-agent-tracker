import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { registerSpa } from './spa.js';

it('serves the manifest and original icons from a real Vite dist, preserving SPA fallback', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'supa-p2-e-dist-'));
  const dist = path.join(scratch, 'dist');
  const app = Fastify();
  try {
    await build({ logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
    await registerSpa(app, dist);
    const response = await app.inject('/manifest.webmanifest');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/manifest+json');
    const manifest = response.json();
    expect(manifest).toMatchObject({ name: 'Supa Agent Tracker', short_name: 'Supa Agents', start_url: '/needs-me', scope: '/', display: 'standalone', theme_color: '#172c36', background_color: '#f4f6f6' });
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
    for (const [src, size] of [...manifest.icons.map((icon: { src: string; sizes: string }) => [icon.src, Number(icon.sizes.split('x')[0])]), ['/apple-touch-icon.png', 180], ['/favicon-32.png', 32]] as [string, number][]) {
      const image = await app.inject(src);
      expect(image.statusCode).toBe(200);
      expect(image.headers['content-type']).toContain('image/png');
      const original = readFileSync(path.join(dist, src));
      expect(image.rawPayload).toEqual(original);
      expect(original.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(original.readUInt32BE(16)).toBe(size);
      expect(original.readUInt32BE(20)).toBe(size);
    }
    const favicon = await app.inject('/favicon-32.png');
    expect(favicon.statusCode).toBe(200);
    expect(favicon.headers['content-type']).toContain('image/png');
    const home = await app.inject('/projects');
    expect(home.body).toContain('<title>Supa Agent Tracker</title>');
    expect(home.body).toContain('rel="manifest"');
    expect(home.body).toContain('rel="apple-touch-icon"');
    expect(home.body).toContain('apple-mobile-web-app-capable');
    const missing = await app.inject('/nonexistent.png');
    expect(missing.statusCode).toBe(200);
    expect(missing.headers['content-type']).toContain('text/html');
    expect(missing.body).toBe(home.body);
  } finally {
    await app.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}, 30_000);
