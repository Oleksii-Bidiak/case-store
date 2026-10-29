import type { Metadata } from "next";
import { PREVIEW_ROBOTS } from "@/shared/api/preview-token";
import { PreviewInvalidNote } from "@/widgets/preview-bar";
import HomePage, { generateMetadata as homeMetadata } from "../../page";

/**
 * `/preview/invalid` — where `/preview` sends a link store-api refused:
 * invalid, expired, revoked, or pointing at something that is gone (TASK-669,
 * mockup HomepageBlocks #invalid).
 *
 * A refused token does not say which page it was for, so the visitor gets the
 * public homepage — what shoppers see right now — under a note, rather than a
 * dead end. It is the SAME page as `/` (no draft mode is on here, so it renders
 * the published blocks), with `noindex`: this address must never compete with
 * the homepage in search. Same hourly floor as `/`; the block and banner reads
 * carry the same ISR tags, so admin writes purge it too.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await homeMetadata()), robots: PREVIEW_ROBOTS };
}

export default async function PreviewInvalidPage() {
  return (
    <>
      <PreviewInvalidNote />
      <HomePage />
    </>
  );
}
