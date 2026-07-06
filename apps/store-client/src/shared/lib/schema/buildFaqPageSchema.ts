/** A single FAQ entry (question + answer) for the FAQPage schema. */
export interface FaqSchemaItem {
  question: string;
  answer: string;
}

/**
 * Build a Schema.org FAQPage JSON-LD graph from a list of Q&A pairs (TASK-242).
 *
 * Emits `{ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name,
 * acceptedAnswer: { "@type": "Answer", text } }] }`. Entries with a blank
 * question or answer are dropped so a half-filled admin row never produces an
 * invalid node. Pure function — no React/routing/API dependency (unit-testable).
 */
export function buildFaqPageSchema(
  items: readonly FaqSchemaItem[],
): Record<string, unknown> {
  const mainEntity = items
    .filter(
      (item) =>
        item.question.trim().length > 0 && item.answer.trim().length > 0,
    )
    .map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    }));

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  };
}
