import { ApiProperty } from '@nestjs/swagger';

/** One group of words that search treats as the same word (TASK-559). */
export class SearchSynonymGroupEntity {
  @ApiProperty({
    description:
      'Terms that are synonyms of each other, in both directions. Lowercase, one word each.',
    example: ['чохол', 'чохли', 'case', 'cases'],
    type: [String],
  })
  terms!: string[];
}

/** The search-synonym list as the admin screen reads and saves it. */
export class SearchSynonymsEntity {
  @ApiProperty({ type: [SearchSynonymGroupEntity] })
  groups!: SearchSynonymGroupEntity[];

  @ApiProperty({
    description:
      'True when the owner has never saved a list (or saved an empty one) and search uses the built-in UA↔EN dictionary shown in `groups`.',
    example: false,
  })
  isDefault!: boolean;
}

/** PUT response: the saved list plus whether the search engine took it. */
export class SearchSynonymsSaveResultEntity extends SearchSynonymsEntity {
  @ApiProperty({
    description:
      'True when both search indexes (products, blog) confirmed the new synonyms. False when the engine is unconfigured or unreachable — the list is saved anyway and reaches the engine on the next restart or reindex.',
    example: true,
  })
  appliedToSearch!: boolean;
}

export class SearchSynonymsResponseEnvelope {
  @ApiProperty({ type: SearchSynonymsEntity })
  data!: SearchSynonymsEntity;
}

export class SearchSynonymsSaveResponseEnvelope {
  @ApiProperty({ type: SearchSynonymsSaveResultEntity })
  data!: SearchSynonymsSaveResultEntity;
}
