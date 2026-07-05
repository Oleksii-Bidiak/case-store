import { PublishStatus } from '@prisma/client';
import { resolvePublishState } from './resolve-publish-state';

describe('resolvePublishState', () => {
  const now = new Date('2026-07-05T12:00:00.000Z');

  describe('PUBLISHED', () => {
    it('sets publishedAt to now and clears scheduledAt', () => {
      const result = resolvePublishState({ status: PublishStatus.PUBLISHED }, now);

      expect(result).toEqual({
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      });
    });

    it('clears a stray scheduledAt even if provided', () => {
      const future = new Date('2026-08-01T00:00:00.000Z');
      const result = resolvePublishState(
        { status: PublishStatus.PUBLISHED, scheduledAt: future },
        now,
      );

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(result.scheduledAt).toBeNull();
      expect(result.publishedAt).toEqual(now);
    });
  });

  describe('SCHEDULED', () => {
    it('keeps a future scheduledAt and leaves publishedAt null', () => {
      const future = new Date('2026-07-06T00:00:00.000Z');
      const result = resolvePublishState(
        { status: PublishStatus.SCHEDULED, scheduledAt: future },
        now,
      );

      expect(result).toEqual({
        status: PublishStatus.SCHEDULED,
        publishedAt: null,
        scheduledAt: future,
      });
    });

    it('collapses to PUBLISHED when scheduledAt is in the past', () => {
      const past = new Date('2026-07-04T00:00:00.000Z');
      const result = resolvePublishState(
        { status: PublishStatus.SCHEDULED, scheduledAt: past },
        now,
      );

      expect(result).toEqual({
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      });
    });

    it('collapses to PUBLISHED when scheduledAt equals now (boundary)', () => {
      const result = resolvePublishState(
        { status: PublishStatus.SCHEDULED, scheduledAt: new Date(now) },
        now,
      );

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(result.scheduledAt).toBeNull();
    });

    it('collapses to PUBLISHED when scheduledAt is absent', () => {
      const result = resolvePublishState({ status: PublishStatus.SCHEDULED }, now);

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(result.publishedAt).toEqual(now);
      expect(result.scheduledAt).toBeNull();
    });

    it('collapses to PUBLISHED when scheduledAt is null', () => {
      const result = resolvePublishState(
        { status: PublishStatus.SCHEDULED, scheduledAt: null },
        now,
      );

      expect(result.status).toBe(PublishStatus.PUBLISHED);
    });
  });

  describe('DRAFT', () => {
    it('nulls both timestamps', () => {
      const result = resolvePublishState({ status: PublishStatus.DRAFT }, now);

      expect(result).toEqual({
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });
    });

    it('ignores a scheduledAt on a DRAFT', () => {
      const future = new Date('2026-08-01T00:00:00.000Z');
      const result = resolvePublishState({ status: PublishStatus.DRAFT, scheduledAt: future }, now);

      expect(result.scheduledAt).toBeNull();
      expect(result.publishedAt).toBeNull();
    });
  });
});
