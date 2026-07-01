import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicRankResponse } from '@repo/contracts/ranks';

import { BeltRanksService } from './belt-ranks.service.js';
import { PublicBeltRanksController } from './public-belt-ranks.controller.js';

/**
 * The public controller is one endpoint — `GET /public/ranks/:slug`,
 * decorated `@Public()` so the AuthGuard skips it entirely. The spec
 * pins:
 *
 *   1. Delegation: `findBySlug(slug)` calls `service.findPublicBySlug(slug)`.
 *   2. Pass-through of the hydrated response shape (rank + system +
 *      organisation) the service returns.
 *   3. Error propagation: service rejections bubble untransformed.
 *
 * The "not publicly visible → 404" rule lives in the service
 * (`belt-ranks.service.spec.ts` already pins it). This spec just
 * confirms the controller does not interpose between the service
 * and the response shape.
 */

const sampleResponse: PublicRankResponse = {
  rank: {
    id: 'r-1',
    organisationId: null,
    systemId: 's-1',
    level: 1,
    sortOrder: 1,
    nameJa: null,
    nameRomaji: 'shodan',
    nameEn: 'Shodan',
    nameSv: 'Shodan',
    nameFi: 'Shodan',
    beltColor: '#000000',
    visuals: { gradient: 'white' },
    imageUrl: null,
    descriptionEn: null,
    descriptionSv: null,
    descriptionFi: null,
    publiclyVisible: true,
    slug: 'shodan-en',
    minAge: null,
    nextRankId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  system: { id: 's-1', code: 'kyu-dan', nameEn: 'Kyu/Dan', nameSv: 'Kyu/Dan', nameFi: 'Kyu/Dan' },
  organisation: null,
  requirements: null,
};

function serviceStub() {
  return {
    findPublicBySlug: vi.fn(),
  } as unknown as Record<keyof BeltRanksService, ReturnType<typeof vi.fn>>;
}

async function makeController(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [PublicBeltRanksController],
    providers: [{ provide: BeltRanksService, useValue: service }],
  }).compile();
  return module.get(PublicBeltRanksController);
}

describe('PublicBeltRanksController.findBySlug', () => {
  let service: ReturnType<typeof serviceStub>;
  let controller: PublicBeltRanksController;

  beforeEach(async () => {
    service = serviceStub();
    controller = await makeController(service);
  });

  it('forwards the slug param to service.findPublicBySlug', async () => {
    service.findPublicBySlug.mockResolvedValue(sampleResponse);
    const out = await controller.findBySlug('shodan-en');
    expect(service.findPublicBySlug).toHaveBeenCalledWith('shodan-en');
    expect(out).toBe(sampleResponse);
  });

  it('passes the hydrated response shape through verbatim', async () => {
    service.findPublicBySlug.mockResolvedValue(sampleResponse);
    const out = await controller.findBySlug('shodan-en');
    expect(out).toEqual(sampleResponse);
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('not found');
    service.findPublicBySlug.mockRejectedValue(error);
    await expect(controller.findBySlug('missing')).rejects.toBe(error);
  });
});
