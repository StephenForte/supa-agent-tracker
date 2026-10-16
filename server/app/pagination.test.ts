import { describe, expect, it } from 'vitest';

import { MAX_PAGE_LIMIT, PaginationError, pageItems, parsePageQuery } from './pagination.js';

describe('pagination bounds', () => {
  it('defaults a missing limit and treats an empty cursor as the first page', () => {
    expect(parsePageQuery({})).toEqual({ cursor: null, limit: 50 });
    expect(parsePageQuery({ cursor: '', limit: '' })).toEqual({ cursor: null, limit: 50 });
  });

  it('clamps limit to the maximum and keeps a smaller limit', () => {
    expect(parsePageQuery({ limit: '25' }).limit).toBe(25);
    expect(parsePageQuery({ limit: '100' }).limit).toBe(MAX_PAGE_LIMIT);
    expect(parsePageQuery({ limit: '10000' }).limit).toBe(MAX_PAGE_LIMIT);
  });

  it('rejects a non-positive or non-integer limit', () => {
    expect(() => parsePageQuery({ limit: '0' })).toThrow(PaginationError);
    expect(() => parsePageQuery({ limit: '-5' })).toThrow(PaginationError);
    expect(() => parsePageQuery({ limit: '1.5' })).toThrow(PaginationError);
    expect(() => parsePageQuery({ limit: '1e2' })).toThrow(PaginationError);
  });

  it('returns nextCursor only when another row was fetched', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pageItems(rows, 2, (row) => row.id)).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: 'b',
    });
    expect(pageItems(rows.slice(0, 2), 2, (row) => row.id)).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: null,
    });
  });
});
