import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LookupTableService,
  type LookupTableRepository,
} from './lookup-table.service.js';

/**
 * Stand-in row + API types. The test exercises every base-class
 * method against a stub repo so a future tweak to the abstract
 * service can't silently break a subclass.
 */
interface Row {
  id: string;
  name: string;
  inUse: number;
}
interface Api {
  id: string;
  name: string;
}
interface Create {
  name: string;
}
interface Update {
  name?: string;
}

function makeRepo(initial: Row[] = []): LookupTableRepository<string, Row, { name: string }, { name?: string }> & {
  insertCalls: number;
  updateCalls: number;
  deleteCalls: number;
} {
  const store = new Map(initial.map((r) => [r.id, { ...r }]));
  let seq = initial.length;
  return {
    insertCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    findByKey: async (key) => store.get(key) ?? null,
    findAll: async () => Array.from(store.values()),
    insert: async function (values) {
      this.insertCalls++;
      const id = `id-${++seq}`;
      const row: Row = { id, name: values.name, inUse: 0 };
      store.set(id, row);
      return row;
    },
    update: async function (key, patch) {
      this.updateCalls++;
      const row = store.get(key);
      if (!row) return null;
      const updated = { ...row, ...patch };
      store.set(key, updated);
      return updated;
    },
    delete: async function (key) {
      this.deleteCalls++;
      store.delete(key);
    },
  };
}

class TestService extends LookupTableService<string, Row, Api, Create, Update, { name: string }, { name?: string }> {
  protected readonly entityLabel = 'Widget';
  constructor(
    protected readonly repo: ReturnType<typeof makeRepo>,
    private readonly deleteGuard: (row: Row) => Promise<void> = async () => {},
  ) {
    super();
  }
  protected toApi(row: Row): Api {
    return { id: row.id, name: row.name };
  }
  protected inputToInsertValues(input: Create) {
    return { name: input.name };
  }
  protected inputToPatch(input: Update) {
    return input.name !== undefined ? { name: input.name } : {};
  }
  protected assertCanDelete(existing: Row): Promise<void> {
    return this.deleteGuard(existing);
  }
}

describe('LookupTableService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let svc: TestService;

  beforeEach(() => {
    repo = makeRepo([
      { id: 'a', name: 'Alpha', inUse: 0 },
      { id: 'b', name: 'Beta', inUse: 1 },
    ]);
    svc = new TestService(repo);
  });

  it('list() maps every row through toApi()', async () => {
    expect(await svc.list()).toEqual([
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ]);
  });

  it('findByKey() returns the API shape for an existing row', async () => {
    expect(await svc.findByKey('a')).toEqual({ id: 'a', name: 'Alpha' });
  });

  it('findByKey() throws NotFoundException for a missing key', async () => {
    await expect(svc.findByKey('zzz')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create() inserts and returns the API shape', async () => {
    const created = await svc.create({ name: 'Gamma' });
    expect(created.name).toBe('Gamma');
    expect(repo.insertCalls).toBe(1);
  });

  it('update() patches and returns the API shape', async () => {
    const updated = await svc.update('a', { name: 'Alpha2' });
    expect(updated).toEqual({ id: 'a', name: 'Alpha2' });
    expect(repo.updateCalls).toBe(1);
  });

  it('update() throws NotFoundException when the row is gone mid-patch', async () => {
    await expect(svc.update('zzz', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete() removes a row when the guard passes', async () => {
    await svc.delete('a');
    expect(repo.deleteCalls).toBe(1);
    expect(await repo.findByKey('a')).toBeNull();
  });

  it('delete() surfaces the guard ConflictException without deleting', async () => {
    const svcWithGuard = new TestService(repo, async (row) => {
      if (row.inUse > 0) {
        throw new ConflictException({
          error: { code: 'IN_USE', message: `Cannot delete: ${row.inUse} ref(s).` },
        });
      }
    });
    await expect(svcWithGuard.delete('b')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.deleteCalls).toBe(0);
    expect(await repo.findByKey('b')).not.toBeNull();
  });

  it('delete() throws NotFoundException for a missing key', async () => {
    await expect(svc.delete('zzz')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('notFound() embeds the entity label in the message', async () => {
    try {
      await svc.findByKey('zzz');
      expect.fail('expected NotFoundException');
    } catch (err) {
      expect((err as NotFoundException).getResponse()).toMatchObject({
        error: { message: 'Widget zzz not found.' },
      });
    }
  });
});
