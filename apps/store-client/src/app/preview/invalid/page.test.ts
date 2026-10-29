// The landing for a refused preview link (TASK-669, mockup #invalid): the public
// homepage under a note, never indexed. The homepage itself is pinned by
// app/page.test.ts, so it is stubbed here.
jest.mock("../../page", () => {
  const HomePage = Object.assign(() => null, { displayName: "HomePage" });
  return {
    __esModule: true,
    default: HomePage,
    generateMetadata: jest.fn().mockResolvedValue({
      title: { absolute: "Головна | CaseStore" },
      alternates: { canonical: "http://localhost:3000" },
    }),
  };
});

import { PREVIEW_ROBOTS } from "@/shared/api/preview-token";
import { PreviewInvalidNote } from "@/widgets/preview-bar";
import HomePage from "../../page";
import PreviewInvalidPage, { generateMetadata, revalidate } from "./page";

describe("/preview/invalid (TASK-669)", () => {
  it("is the homepage's metadata with noindex — never a rival of / in search", async () => {
    const meta = await generateMetadata();

    expect(meta.robots).toEqual(PREVIEW_ROBOTS);
    expect(meta.alternates?.canonical).toBe("http://localhost:3000");
    expect(meta.title).toEqual({ absolute: "Головна | CaseStore" });
  });

  it("puts the note above the public homepage", async () => {
    const tree = (await PreviewInvalidPage()) as {
      props: { children: { type: unknown }[] };
    };

    expect(tree.props.children.map((child) => child.type)).toEqual([
      PreviewInvalidNote,
      HomePage,
    ]);
  });

  it("is cached like the homepage — it opens no draft", () => {
    expect(revalidate).toBe(3600);
  });
});
