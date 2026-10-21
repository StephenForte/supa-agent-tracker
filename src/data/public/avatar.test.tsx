import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '../hooks';
import { createHttpSources } from '../http/createHttpSources';
import { AVATAR_PICK_LIMIT, AVATAR_PREPARED_TOO_LARGE, AVATAR_TOO_LARGE, AVATAR_UPLOAD_LIMIT, prepareAvatar } from './avatar';
import { PublicProfileForm } from '../../pages/settings/PublicProfileForm';
import { emptyPublicProfile } from '../../domain/public/profile';
import type { Account } from '../../domain/types';

const account: Account = {
  id: 'user-1', name: 'Ada', email: 'ada@example.com', emailVerified: true, demo: false,
  publicHandle: 'ada-bot', publicProfile: emptyPublicProfile(),
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubCanvas(result: Blob | null, fallback: Blob | null = null) {
  const drawImage = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200, close() {} })));
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (callback, type) {
    if (type === 'image/webp') callback(result);
    else callback(fallback);
  };
  return drawImage;
}

describe('avatar upload', () => {
  it('rejects a file over 10 MB before decoding', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const file = new File([new Uint8Array([1])], 'phone.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: AVATAR_PICK_LIMIT + 1 });
    await expect(prepareAvatar(file)).rejects.toThrow(AVATAR_TOO_LARGE);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects a prepared image over 256 KiB', async () => {
    stubCanvas(new Blob([new Uint8Array(AVATAR_UPLOAD_LIMIT + 1)], { type: 'image/webp' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'phone.jpg', { type: 'image/jpeg' });
    await expect(prepareAvatar(file)).rejects.toThrow(AVATAR_PREPARED_TOO_LARGE);
  });

  it('center-crops and falls back to png when webp is unavailable', async () => {
    const png = new Blob([new Uint8Array([4])], { type: 'image/png' });
    const drawImage = stubCanvas(null, png);
    const blob = await prepareAvatar(new File([new Uint8Array([1])], 'phone.jpg', { type: 'image/jpeg' }));
    expect(blob).toBe(png);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, 256, 256);
  });

  it('puts the canvas blob and never the original file', async () => {
    const canvasBlob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/webp' });
    stubCanvas(canvasBlob);
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'phone.jpg', { type: 'image/jpeg' });
    const created: unknown[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { created.push(value); return 'blob:preview'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect(init?.body).toBe(canvasBlob);
      expect(init?.body).not.toBe(file);
      expect(init?.body).not.toBeInstanceOf(File);
      expect((init?.body as Blob).type).toBe('image/webp');
      expect(init?.headers).toMatchObject({ 'Content-Type': 'image/webp' });
      return json({ ...account, publicProfile: { ...emptyPublicProfile(), avatarUpdatedAt: '2026-10-21T00:00:00.000Z' } });
    });
    const sources = createHttpSources({ fetch });
    render(<MemoryRouter><DataProvider sources={sources}><PublicProfileForm account={account} /></DataProvider></MemoryRouter>);
    await userEvent.upload(screen.getByLabelText('Avatar'), file);
    expect(await screen.findByText('Avatar saved.')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('/api/account/avatar');
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(created).toEqual([canvasBlob]);
    expect(created).not.toContain(file);
  });
});
