import Link from "next/link";
import { ClockIcon, StarIcon } from "lucide-react";
import type { BlogPostEntity } from "@/entities/blog";
import {
  Badge,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { formatDate } from "@/shared/lib";
import { dict } from "@/shared/config";
import { blogPostStatusLabel, joinFacts } from "../model/post-views";

const d = dict.blogPosts;

/**
 * Width the default-visible columns may share at 1440: content area 1136
 * minus the «⋯» column and the box border. No checkbox column — the API has no
 * bulk endpoint for posts, so there is nothing to select for (TASK-1070 tail).
 */
export const BLOG_POST_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** 64×40 cover, or a neutral «без обкладинки» — a cover is optional. */
export function BlogPostThumb({ post }: { post: BlogPostEntity }) {
  if (post.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts; next/image would need every one allowlisted
      <img
        src={post.coverImageUrl}
        alt=""
        loading="lazy"
        className="h-10 w-16 shrink-0 rounded-md border object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/50 px-1 text-center text-2xs leading-tight text-muted-foreground">
      {d.noCover}
    </span>
  );
}

/** «Марія Литвин · 9 хв» — what the card on the site says under the title. */
export function bylineOf(post: BlogPostEntity): string {
  return joinFacts([
    post.authorName,
    post.readingMinutes ? d.minutes(post.readingMinutes) : null,
  ]);
}

/** When it went live; a scheduled post says its date in the status instead. */
function publishDateOf(post: BlogPostEntity): string | null {
  return post.status === "PUBLISHED" && post.publishedAt
    ? formatDate(post.publishedAt)
    : null;
}

/**
 * The status badge (TASK-430), plus «★ Головна» and «Не в списках» (БЛ1) —
 * the two flags that used to be columns of «—» and are now said only when
 * they are true.
 *
 * A scheduled post reads «Заплановано на 19.09.2026»: the date is what
 * separates a post going out on Friday from one somebody forgot. `formatDate`,
 * so the year is visible — a schedule typed into the wrong year is the one
 * mistake worth catching from the list.
 */
export function BlogPostStatus({ post }: { post: BlogPostEntity }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {post.status === "SCHEDULED" ? (
        <Badge variant="outline">
          <ClockIcon aria-hidden="true" />
          {post.scheduledAt
            ? d.statusScheduledOn(formatDate(post.scheduledAt))
            : d.statusScheduled}
        </Badge>
      ) : (
        <Badge variant={post.status === "PUBLISHED" ? "default" : "secondary"}>
          {blogPostStatusLabel(post.status)}
        </Badge>
      )}
      {post.featured ? (
        <Badge variant="outline">
          <StarIcon aria-hidden="true" />
          {d.featuredBadge}
        </Badge>
      ) : null}
      {/* TASK-436 — an unlisted post is published and reachable, so no status
          says it; without this badge it looks like any other post. */}
      {post.listed ? null : (
        <Badge variant="secondary">{d.unlistedBadge}</Badge>
      )}
    </span>
  );
}

/** Columns of the posts register (BlogProposal БЛ1). The API sorts nothing. */
export function buildBlogPostColumns(): RegistryColumn<BlogPostEntity>[] {
  return [
    {
      id: "title",
      label: d.colTitle,
      locked: true,
      rowLink: true,
      defaultWidth: 520,
      minWidth: 260,
      cell: (post) => (
        <span className="flex items-center gap-3">
          <BlogPostThumb post={post} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 font-medium text-foreground">
              {post.title}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {bylineOf(post)}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "category",
      label: d.colCategory,
      defaultWidth: 160,
      minWidth: 112,
      cell: (post) => (
        <span className="text-foreground">{post.category.name}</span>
      ),
    },
    {
      id: "date",
      label: d.colDate,
      defaultWidth: 112,
      minWidth: 96,
      className: "tabular-nums",
      cell: (post) =>
        publishDateOf(post) ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 296,
      minWidth: 160,
      cell: (post) => <BlogPostStatus post={post} />,
    },
  ];
}

/** One post below md (БЛ3): cover, title, the facts in one line, the status. */
export function renderBlogPostCard(
  post: BlogPostEntity,
  parts: RegistryCardParts,
) {
  const title = (
    <span className="line-clamp-3 font-medium text-foreground">
      {post.title}
    </span>
  );
  return (
    <div className="flex items-start gap-3">
      <BlogPostThumb post={post} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {parts.href ? (
            <Link
              href={parts.href}
              className="rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {title}
            </Link>
          ) : (
            title
          )}
          {parts.actions}
        </div>
        <span className="text-xs text-muted-foreground">
          {joinFacts([
            post.category.name,
            publishDateOf(post),
            post.authorName,
            post.readingMinutes ? d.minutes(post.readingMinutes) : null,
          ])}
        </span>
        <BlogPostStatus post={post} />
      </div>
    </div>
  );
}
