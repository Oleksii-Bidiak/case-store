import { ComparedValueEntity, roundMoney } from './report-common.entity';

describe('ComparedValueEntity.of', () => {
  it('gives the relative change with one decimal', () => {
    expect(ComparedValueEntity.of(110, 100)).toEqual({
      current: 110,
      previous: 100,
      changePct: 10,
    });
    expect(ComparedValueEntity.of(88, 100).changePct).toBe(-12);
    expect(ComparedValueEntity.of(1, 3).changePct).toBe(-66.7);
  });

  it('answers null, not 0 or Infinity, when there is nothing to compare with', () => {
    expect(ComparedValueEntity.of(500, 0).changePct).toBeNull();
    expect(ComparedValueEntity.of(0, 0).changePct).toBeNull();
  });

  it('measures change against the magnitude of a negative previous value', () => {
    // A month of net refunds (−100) followed by +100 is an improvement.
    expect(ComparedValueEntity.of(100, -100).changePct).toBe(200);
  });
});

describe('roundMoney', () => {
  it('keeps kopecks exact after float summing', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(-4200.004)).toBe(-4200);
  });
});
