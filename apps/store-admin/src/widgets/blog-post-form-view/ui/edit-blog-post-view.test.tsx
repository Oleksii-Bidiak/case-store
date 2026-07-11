import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { EditBlogPostView } from "./edit-blog-post-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// The rich-text body editor (Tiptap) touches the DOM on init; stub it with a
// controlled <textarea> proxy (same idiom as blog-post-form.test.tsx).
jest.mock("@/shared/ui/rich-text-editor", () => ({
  __esModule: true,
  RichTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (html: string) => void;
  }) => (
    <textarea
      data-testid="rte-stub"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const POST_ID = "post-uuid-1";

function makePost(status: "DRAFT" | "PUBLISHED") {
  return {
    id: POST_ID,
    slug: "iphone-16-oglyad",
    title: "Огляд iPhone 16",
    excerpt: "Короткий опис",
    content: "<p>Body</p>",
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: "Автор",
    readingMinutes: 5,
    featured: false,
    categoryId: "cat-1",
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status,
    publishedAt: status === "PUBLISHED" ? "2026-06-01T09:00:00.000Z" : null,
    scheduledAt: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  };
}

function stubPost(post: ReturnType<typeof makePost>) {
  const putCalls: unknown[] = [];
  server.use(
    http.get("*/api/admin/blog/categories", () =>
      HttpResponse.json({
        data: [{ id: "cat-1", slug: "guides", name: "Гайди", sortOrder: 0 }],
      }),
    ),
    http.get(`*/api/admin/blog/posts/${POST_ID}`, () =>
      HttpResponse.json({ data: post }),
    ),
    http.put(`*/api/admin/blog/posts/${POST_ID}`, async ({ request }) => {
      putCalls.push(await request.json());
      return HttpResponse.json({ data: post });
    }),
  );
  return putCalls;
}

async function renderAndWaitForForm(post: ReturnType<typeof makePost>) {
  const putCalls = stubPost(post);
  renderWithProviders(<EditBlogPostView postId={POST_ID} />);
  await waitFor(() =>
    expect(screen.getByLabelText(dict.blogPostForm.slug)).toHaveValue(
      post.slug,
    ),
  );
  return putCalls;
}

const submit = () =>
  userEvent.click(
    screen.getByRole("button", { name: dict.common.saveChanges }),
  );

describe("EditBlogPostView — slug-rename guard (TASK-285)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("submits without any confirm when the slug is unchanged on a published post", async () => {
    const putCalls = await renderAndWaitForForm(makePost("PUBLISHED"));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks the update when the admin cancels the published-slug-change confirm", async () => {
    confirmSpy.mockReturnValue(false);
    const putCalls = await renderAndWaitForForm(makePost("PUBLISHED"));

    const slugField = screen.getByLabelText(dict.blogPostForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.blogPosts.slugChangeConfirm("iphone-16-oglyad", "nova-adresa"),
    );
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the confirm", async () => {
    const putCalls = await renderAndWaitForForm(makePost("PUBLISHED"));

    const slugField = screen.getByLabelText(dict.blogPostForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it("never confirms a slug change on a DRAFT post", async () => {
    const putCalls = await renderAndWaitForForm(makePost("DRAFT"));

    const slugField = screen.getByLabelText(dict.blogPostForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
