import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('ships all declared PNGs at their stated sizes and keeps generators outside public', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  expect(manifest.start_url).toBe('/needs-me');
  const html = readFileSync('index.html', 'utf8');
  const files: [string, number][] = [...manifest.icons.map((icon: { src: string; sizes: string }) => [icon.src, Number(icon.sizes.split('x')[0])]), ['/apple-touch-icon.png', 180], ['/favicon-32.png', 32]];
  for (const [name, size] of files) {
    const png = readFileSync(`public${name}`);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  }
  expect(html).toContain('href="/apple-touch-icon.png"');
  expect(html).toContain('href="/favicon-32.png"');
  expect(html).not.toContain('favicon.svg');
  expect(readdirSync('public', { recursive: true }).some(name => /\.(py|sh)$/.test(String(name)))).toBe(false);
  expect(createHash('sha256').update(readFileSync('assets/icon/source.jpg')).digest('hex')).toBe('46702b7854d588960c6c57bc95ab76d24a4baff486ee6a227d5250e48eeb58cc');
});

it('keeps every RGB channel of all four apple-icon corner patches below 230', () => {
  // Decode the delivered RGB PNG (all five PNG filter modes), independent of sips.
  const png = readFileSync('public/apple-touch-icon.png');
  expect(png[24]).toBe(8); expect(png[25]).toBe(2);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), stride = width * 3;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? pixels[y * stride + x - 3]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = x >= 3 && y > 0 ? pixels[(y - 1) * stride + x - 3]! : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter]!;
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1]! + predictor) & 255;
    }
  }
  for (const y of [0, 1, height - 2, height - 1]) for (const x of [0, 1, width - 2, width - 1]) {
    for (let channel = 0; channel < 3; channel++) expect(pixels[y * stride + x * 3 + channel]).toBeLessThan(230);
  }
});
