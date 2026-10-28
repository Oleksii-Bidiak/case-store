"use client";

import {
  ReadOnlyField,
  ReadOnlyImage,
  ReadOnlyLayout,
  ReadOnlyLink,
  ReadOnlyNotice,
  ReadOnlyRichText,
  ReadOnlySection,
  ReadOnlyTags,
} from "@/shared/ui";
import { dict, pageSitePath, STOREFRONT_URL } from "@/shared/config";
import { formatDateTime, fromKyivDateTimeLocal } from "@/shared/lib";
import { parseKeywords } from "@/shared/lib/seo";
import type { PageFormInput, PageKindValue } from "../model/page-schema";

const f = dict.pageForm;
const rv = dict.readOnlyView;

const KIND_LABELS: Record<PageKindValue, string> = {
  LEGAL: f.kindLegal,
  INFO: f.kindInfo,
  HUB: f.kindHub,
};

const STATUS_LABELS: Record<PageFormInput["status"], string> = {
  PUBLISHED: f.statusPublished,
  DRAFT: f.statusDraft,
  SCHEDULED: f.statusScheduled,
};

/**
 * The service page without `pages:write` (TASK-667 template, РО-3): the
 * form's «Основне · Вміст · SEO і соцмережі · Публікація» as text, the body
 * as the site renders it, «Не задано» with what it means for Google.
 */
export function PageReadOnly({ values }: { values: PageFormInput }) {
  const kind = values.kind ?? "LEGAL";
  const sitePath = values.slug ? pageSitePath(kind, values.slug) : null;
  const keywords = parseKeywords(values.keywords);
  const isHub = kind === "HUB";
  return (
    <div className="flex flex-col gap-4">
      <ReadOnlyNotice>{rv.notices.pages}</ReadOnlyNotice>
      <ReadOnlyLayout>
        <ReadOnlySection title={f.sectionMain}>
          <ReadOnlyField label={f.title}>{values.title}</ReadOnlyField>
          <ReadOnlyField label={f.kind}>{KIND_LABELS[kind]}</ReadOnlyField>
          <ReadOnlyField label={f.address} mono>
            {sitePath ? (
              values.status === "PUBLISHED" ? (
                <ReadOnlyLink href={`${STOREFRONT_URL}${sitePath}`} external>
                  {sitePath}
                </ReadOnlyLink>
              ) : (
                sitePath
              )
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionContent}>
          <ReadOnlyField label={f.excerpt} multiline>
            {values.excerpt}
          </ReadOnlyField>
          <ReadOnlyField
            label={f.content}
            empty={!values.content.replace(/<[^>]*>/g, "").trim()}
          >
            {isHub ? (
              <p className="mb-2 text-xs text-muted-foreground">
                {f.hubContentHint}
              </p>
            ) : null}
            <ReadOnlyRichText html={values.content} />
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionSeo}>
          <ReadOnlyField
            label={f.metaTitle}
            emptyConsequence={rv.seoTitleFromName}
          >
            {values.metaTitle}
          </ReadOnlyField>
          <ReadOnlyField
            label={f.metaDescription}
            emptyConsequence={rv.seoDescriptionFromText}
          >
            {values.metaDescription}
          </ReadOnlyField>
          <ReadOnlyField label={f.keywords} empty={keywords.length === 0}>
            <ReadOnlyTags tags={keywords} />
          </ReadOnlyField>
          <ReadOnlyField
            label={dict.seoFields.ogImage}
            emptyConsequence={rv.ogImageDefault}
          >
            {values.ogImage ? (
              <ReadOnlyImage
                src={values.ogImage}
                alt={dict.seoFields.ogImage}
              />
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>

        <ReadOnlySection title={f.sectionPublish}>
          <ReadOnlyField label={f.status}>
            {STATUS_LABELS[values.status]}
          </ReadOnlyField>
          {values.status === "SCHEDULED" ? (
            <ReadOnlyField label={f.scheduledAt}>
              {values.scheduledAt
                ? formatDateTime(
                    fromKyivDateTimeLocal(values.scheduledAt) ??
                      values.scheduledAt,
                  )
                : null}
            </ReadOnlyField>
          ) : null}
        </ReadOnlySection>
      </ReadOnlyLayout>
    </div>
  );
}
