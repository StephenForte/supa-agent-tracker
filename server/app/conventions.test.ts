import { describe, expect, it } from 'vitest';

import { conflictBody, errorCodes } from './errors.js';
import { mutationFields } from './conventions.js';

describe('API error conventions', () => {
  it('puts the current resource on a conflict', () => {
    expect(conflictBody('Revision conflict', { id: 'run_1', revision: 4 })).toEqual({
      error: {
        code: errorCodes.conflict,
        message: 'Revision conflict',
        details: { current: { id: 'run_1', revision: 4 } },
      },
    });
  });

  it('names the mutation fields later tasks must read', () => {
    expect(mutationFields).toEqual({ requestId: 'request_id', expectedRevision: 'expected_revision' });
  });
});
