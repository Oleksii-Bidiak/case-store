import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { EditBlogPostView } from "./edit-blog-post-view";

const d = dict.blogPosts;

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
    author: null,
    readingMinutes: 5,
    featured: false,
    listed: true,
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

async function renameSlug() {
  const slugField = screen.getByLabelText(dict.blogPostForm.slug);
  await userEvent.clear(slugField);
  await userEvent.type(slugField, "nova-adresa");
  await submit();
}

describe("EditBlogPostView — header (БЛ7)", () => {
  it("names the post and links a published one to the site in a new tab", async () => {
    await renderAndWaitForForm(makePost("PUBLISHED"));

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Огляд iPhone 16",
    });
    expect(heading.parentElement).toHaveTextContent(d.statusPublished);
    expect(heading.parentElement).toHaveTextContent(
      "Гайди · Автор · /blog/iphone-16-oglyad",
    );
    const site = screen.getByRole("link", { name: d.rowOpenSite });
    expect(site).toHaveAttribute(
      "href",
      `${STOREFRONT_URL}/blog/iphone-16-oglyad`,
    );
    expect(site).toHaveAttribute("target", "_blank");
  });

  it("does not link a draft to the site", async () => {
    await renderAndWaitForForm(makePost("DRAFT"));

    expect(
      screen.queryByRole("link", { name: d.rowOpenSite }),
    ).not.toBeInTheDocument();
  });
});

// TASK-285 + TASK-812: the published-slug guard is an AlertDialog now.
describe("EditBlogPostView — slug-rename guard (TASK-285)", () => {
  it("submits without any confirm when the slug is unchanged on a published post", async () => {
    const putCalls = await renderAndWaitForForm(makePost("PUBLISHED"));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("blocks the update when the admin cancels the published-slug-change confirm", async () => {
    const putCalls = await renderAndWaitForForm(makePost("PUBLISHED"));

    await renameSlug();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      d.slugChangeConfirm("iphone-16-oglyad", "nova-adresa"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the confirm", async () => {
    const putCalls = await renderAndWaitForForm(makePost("PUBLISHED"));

    await renameSlug();
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: d.slugChangeAction,
      }),
    );

    await waitFor(() => expect(putCalls).toHaveLength(1));
  });

  it("never confirms a slug change on a DRAFT post", async () => {
    const putCalls = await renderAndWaitForForm(makePost("DRAFT"));

    await renameSlug();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
