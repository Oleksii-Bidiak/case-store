import { QueryClient, dehydrate, useQuery } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { PrefetchBoundary } from "./prefetch-boundary";

/** A consumer rendered like the catalogue widgets: pending → skeleton text. */
function TreeReader({ label }: { label: string }) {
  const { data, isPending } = useQuery<string>({
    queryKey: ["/api/categories/tree"],
    queryFn: () => new Promise<string>(() => {}),
  });
  return <p>{`${label}: ${isPending ? "loading" : data}`}</p>;
}

/** The server's prefetch of the tree, dehydrated. */
function serverState(value: string) {
  const server = new QueryClient();
  server.setQueryData(["/api/categories/tree"], value);
  return dehydrate(server);
}

const render = (client: QueryClient, children: React.ReactNode) =>
  renderToString(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  );

describe("PrefetchBoundary (TASK-563)", () => {
  it("serves prefetched data to a query the layout already created empty", () => {
    // The header renders first and creates the query without data — the case
    // the stock HydrationBoundary defers to an effect, which SSR never runs.
    const html = render(
      new QueryClient(),
      <>
        <TreeReader label="header" />
        <PrefetchBoundary state={serverState("roots")}>
          <TreeReader label="page" />
        </PrefetchBoundary>
      </>,
    );

    expect(html).toContain("header: loading");
    expect(html).toContain("page: roots");
  });

  it("leaves a query that already holds data to the stock (deferred) path", () => {
    const client = new QueryClient();
    client.setQueryData(["/api/categories/tree"], "cached");

    const html = render(
      client,
      <PrefetchBoundary state={serverState("roots")}>
        <TreeReader label="page" />
      </PrefetchBoundary>,
    );

    expect(html).toContain("page: cached");
  });

  it("hydrates a query the cache has never seen, like HydrationBoundary", () => {
    const html = render(
      new QueryClient(),
      <PrefetchBoundary state={serverState("roots")}>
        <TreeReader label="page" />
      </PrefetchBoundary>,
    );

    expect(html).toContain("page: roots");
  });
});
