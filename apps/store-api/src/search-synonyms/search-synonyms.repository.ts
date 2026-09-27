import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/**
 * Database access for the admin-edited search synonyms (TASK-559).
 *
 * The list is read and written WHOLE: the admin screen edits every group at
 * once and saves them together, so there is no per-row API and no row identity
 * anyone depends on. Returns plain term lists — the domain shape — rather than
 * Prisma rows.
 */
@Injectable()
export class SearchSynonymsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every saved group, in the order the admin left them. Empty = never saved. */
  async findAllGroups(): Promise<string[][]> {
    const rows = await this.prisma.searchSynonymGroup.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { terms: true },
    });
    return rows.map((row) => row.terms);
  }

  /**
   * Replace the whole list in ONE transaction, so a reader never sees half of
   * the old list and half of the new one (or, worse, an empty table — which
   * would read as "use the built-in defaults").
   */
  async replaceAllGroups(groups: string[][]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.searchSynonymGroup.deleteMany({}),
      this.prisma.searchSynonymGroup.createMany({
        data: groups.map((terms, sortOrder) => ({ terms, sortOrder })),
      }),
    ]);
  }
}
