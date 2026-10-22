import { applyDeregistrations, applyPermissionChanges } from './registrationEvents.js';

/**
 * Minimal chainable Supabase stub. Records each terminal call so tests can
 * assert on what was written.
 */
function makeSupabase({ integration = null, deleted = [], readError = null, writeError = null } = {}) {
  const calls = { deletes: [], updates: [] };
  const from = vi.fn(() => {
    const filters = {};
    const chain = {
      delete: () => {
        chain.op = 'delete';
        return chain;
      },
      select: () => chain,
      update: (values) => {
        chain.op = 'update';
        chain.values = values;
        return chain;
      },
      eq: (col, val) => {
        filters[col] = val;
        if (chain.op === 'update' && col === 'id') {
          calls.updates.push({ values: chain.values, filters: { ...filters } });
          return Promise.resolve({ error: writeError });
        }
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: integration, error: readError }),
      then: (resolve) => {
        // Awaiting a delete().eq().eq().select() chain
        calls.deletes.push({ ...filters });
        return resolve({ data: writeError ? null : deleted, error: writeError });
      },
    };
    return chain;
  });
  return { client: { from }, calls };
}

describe('applyDeregistrations', () => {
  it('deletes the Garmin integration for each deregistered user', async () => {
    const { client, calls } = makeSupabase({ deleted: [{ id: 'int-1' }] });
    const result = await applyDeregistrations(client, [{ userId: 'garmin-1' }]);
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(calls.deletes[0]).toEqual({ provider: 'garmin', provider_user_id: 'garmin-1' });
  });

  it('counts failures so the receiver can ask Garmin to redeliver', async () => {
    const { client } = makeSupabase({ writeError: { message: 'db down' } });
    const result = await applyDeregistrations(client, [{ userId: 'garmin-1' }]);
    expect(result).toEqual({ removed: 0, failed: 1 });
  });

  it('skips items without a userId', async () => {
    const { client, calls } = makeSupabase();
    const result = await applyDeregistrations(client, [{}]);
    expect(result).toEqual({ removed: 0, failed: 0 });
    expect(calls.deletes).toHaveLength(0);
  });
});

describe('applyPermissionChanges', () => {
  it('stores permissions and keeps sync on while ACTIVITY_EXPORT is granted', async () => {
    const { client, calls } = makeSupabase({ integration: { id: 'int-1', provider_user_data: { garmin_user_id: 'g' } } });
    const result = await applyPermissionChanges(client, [
      { userId: 'g', permissions: ['ACTIVITY_EXPORT', 'COURSE_IMPORT'], changeTimeInSeconds: 100 },
    ]);
    expect(result).toEqual({ updated: 1, failed: 0 });
    const { values } = calls.updates[0];
    expect(values.sync_enabled).toBe(true);
    expect(values.provider_user_data).toMatchObject({
      garmin_user_id: 'g',
      permissions: ['ACTIVITY_EXPORT', 'COURSE_IMPORT'],
      permissions_change_time: 100,
    });
  });

  it('pauses sync when ACTIVITY_EXPORT is withdrawn', async () => {
    const { client, calls } = makeSupabase({ integration: { id: 'int-1', provider_user_data: {} } });
    await applyPermissionChanges(client, [{ userId: 'g', permissions: ['HEALTH_EXPORT'], changeTimeInSeconds: 100 }]);
    expect(calls.updates[0].values.sync_enabled).toBe(false);
  });

  it('ignores a change older than the one already stored', async () => {
    const { client, calls } = makeSupabase({
      integration: { id: 'int-1', provider_user_data: { permissions_change_time: 200 } },
    });
    const result = await applyPermissionChanges(client, [
      { userId: 'g', permissions: [], changeTimeInSeconds: 100 },
    ]);
    expect(result).toEqual({ updated: 0, failed: 0 });
    expect(calls.updates).toHaveLength(0);
  });

  it('does nothing for an unknown Garmin user', async () => {
    const { client, calls } = makeSupabase({ integration: null });
    const result = await applyPermissionChanges(client, [{ userId: 'g', permissions: [] }]);
    expect(result).toEqual({ updated: 0, failed: 0 });
    expect(calls.updates).toHaveLength(0);
  });
});
