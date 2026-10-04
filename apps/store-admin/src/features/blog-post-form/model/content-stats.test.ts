import {
  BLOG_CONTENT_MAX_LENGTH,
  WORDS_PER_MINUTE,
  blogContentStats,
} from "./content-stats";

describe("blogContentStats (BlogProposal БЛ7 — «рахуємо з тексту»)", () => {
  it("counts nothing in an empty document", () => {
    expect(blogContentStats("<p></p>")).toEqual({
      words: 0,
      images: 0,
      minutes: 0,
      length: 7,
    });
  });

  it("counts words across tags, not the tags themselves", () => {
    const stats = blogContentStats(
      "<h2>Камери</h2><p>Основний сенсор&nbsp;підріс, але</p>",
    );
    expect(stats.words).toBe(5);
  });

  it("does not count punctuation alone as a word", () => {
    expect(blogContentStats("<p>Так — ні</p>").words).toBe(2);
  });

  it("counts images", () => {
    expect(
      blogContentStats('<p>Текст</p><img src="a.webp" alt=""><img src="b">')
        .images,
    ).toBe(2);
  });

  it("rounds reading time up to whole minutes, at least one for any text", () => {
    expect(blogContentStats("<p>одне</p>").minutes).toBe(1);
    const words = Array.from({ length: WORDS_PER_MINUTE + 1 }, () => "слово");
    expect(blogContentStats(`<p>${words.join(" ")}</p>`).minutes).toBe(2);
  });

  it("measures the length the API limits — the HTML itself", () => {
    const html = "<p>abc</p>";
    expect(blogContentStats(html).length).toBe(html.length);
    expect(BLOG_CONTENT_MAX_LENGTH).toBe(100_000);
  });
});
