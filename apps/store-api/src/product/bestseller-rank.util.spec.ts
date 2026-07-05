import { rankProductIdsBySales, type SalesRankCandidate } from './bestseller-rank.util';

describe('rankProductIdsBySales (TASK-164)', () => {
  const at = (iso: string) => new Date(iso);

  it('orders products by units sold, most sold first', () => {
    const candidates: SalesRankCandidate[] = [
      { id: 'low', createdAt: at('2024-01-01') },
      { id: 'high', createdAt: at('2024-01-01') },
      { id: 'mid', createdAt: at('2024-01-01') },
    ];
    const sold = new Map([
      ['low', 2],
      ['high', 50],
      ['mid', 10],
    ]);

    expect(rankProductIdsBySales(candidates, sold)).toEqual(['high', 'mid', 'low']);
  });

  it('keeps zero-sales products in the list but sinks them to the bottom', () => {
    const candidates: SalesRankCandidate[] = [
      { id: 'never-sold', createdAt: at('2024-01-01') },
      { id: 'sold', createdAt: at('2024-01-01') },
    ];
    const sold = new Map([['sold', 5]]);

    expect(rankProductIdsBySales(candidates, sold)).toEqual(['sold', 'never-sold']);
  });

  it('breaks ties (equal sales) by newest createdAt first', () => {
    const candidates: SalesRankCandidate[] = [
      { id: 'older', createdAt: at('2024-01-01') },
      { id: 'newer', createdAt: at('2024-06-01') },
    ];
    const sold = new Map([
      ['older', 7],
      ['newer', 7],
    ]);

    expect(rankProductIdsBySales(candidates, sold)).toEqual(['newer', 'older']);
  });

  it('breaks ties among the zero-sales tail by newest first', () => {
    const candidates: SalesRankCandidate[] = [
      { id: 'old-unsold', createdAt: at('2024-01-01') },
      { id: 'new-unsold', createdAt: at('2024-09-01') },
    ];

    expect(rankProductIdsBySales(candidates, new Map())).toEqual(['new-unsold', 'old-unsold']);
  });

  it('does not mutate the input array', () => {
    const candidates: SalesRankCandidate[] = [
      { id: 'a', createdAt: at('2024-01-01') },
      { id: 'b', createdAt: at('2024-01-01') },
    ];
    const snapshot = candidates.map((c) => c.id);
    rankProductIdsBySales(candidates, new Map([['b', 1]]));
    expect(candidates.map((c) => c.id)).toEqual(snapshot);
  });

  it('returns an empty array for no candidates', () => {
    expect(rankProductIdsBySales([], new Map())).toEqual([]);
  });
});
