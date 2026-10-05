import {
  hasUnfilledPlaceholder,
  stripUnfilledBlocks,
  stripUnfilledSentences,
} from "./unfilled-placeholders";

describe("unfilled owner placeholders (TASK-873)", () => {
  it("recognises a bracketed placeholder with letters, not a footnote", () => {
    expect(hasUnfilledPlaceholder("Курʼєр — [вартість]")).toBe(true);
    expect(hasUnfilledPlaceholder("<strong>[N]</strong> років")).toBe(true);
    expect(hasUnfilledPlaceholder("Див. примітку [1]")).toBe(false);
    expect(hasUnfilledPlaceholder("Без дужок")).toBe(false);
  });

  it("drops only the sentence that holds a placeholder", () => {
    expect(
      stripUnfilledSentences(
        "Доставка Новою Поштою — безкоштовно від 1 000 ₴. Курʼєр по місту — [вартість], самовивіз — [адреса пункту самовивозу].",
      ),
    ).toBe("Доставка Новою Поштою — безкоштовно від 1 000 ₴.");
    expect(stripUnfilledSentences("Підтримка: [графік роботи]")).toBe("");
    // A placeholder in the lead sentence takes the dependent tail along.
    expect(
      stripUnfilledSentences("Самовивіз — [адреса пункту]. Безкоштовно."),
    ).toBe("");
    expect(stripUnfilledSentences("Нічого не міняємо.")).toBe(
      "Нічого не міняємо.",
    );
  });

  it("removes emptied list items and keeps the filled ones verbatim", () => {
    const html =
      "<ul><li><p><strong>Нова Пошта</strong> — по всій Україні. Вартість: за тарифом НП.</p></li>" +
      "<li><p><strong>Курʼєр по місту</strong> — [міста курʼєрської доставки] — доставка в день замовлення. Вартість: [вартість].</p></li>" +
      "<li><p><strong>Самовивіз</strong> — [адреса пункту самовивозу]. Безкоштовно.</p></li></ul>";
    const out = stripUnfilledBlocks(html);

    expect(out).not.toMatch(/\[/);
    expect(out).toContain("<strong>Нова Пошта</strong> — по всій Україні.");
    expect(out).not.toContain("Курʼєр по місту");
    // The placeholder sits in the pickup item's lead sentence, so the whole
    // item goes — no orphaned «Безкоштовно.» describing nothing.
    expect(out).not.toContain("Самовивіз");
    expect(out).not.toContain("Безкоштовно.");
  });

  it("takes an emptied list's heading along, and nothing above it", () => {
    const html =
      "<h2>Хто ми</h2><p>Магазин аксесуарів. Працюємо з [рік заснування] року.</p>" +
      "<h2>Реквізити продавця</h2><ul><li>Продавець: [ФОП / ТОВ]</li><li>Email: [email]</li></ul>" +
      "<p>Дякуємо, що ви з нами.</p>";
    const out = stripUnfilledBlocks(html);

    expect(out).toContain("<h2>Хто ми</h2><p>Магазин аксесуарів.</p>");
    expect(out).not.toContain("Реквізити продавця");
    expect(out).toContain("<p>Дякуємо, що ви з нами.</p>");
  });

  it("returns HTML without placeholders untouched", () => {
    const html = "<p>Усе <em>заповнено</em>. Справді.</p>";
    expect(stripUnfilledBlocks(html)).toBe(html);
  });
});
