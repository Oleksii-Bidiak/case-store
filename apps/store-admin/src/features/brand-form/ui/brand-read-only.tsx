"use client";

import type { ReactNode } from "react";
import {
  ReadOnlyBool,
  ReadOnlyField,
  ReadOnlyImage,
  ReadOnlyLayout,
  ReadOnlyLink,
  ReadOnlyNotice,
  ReadOnlySection,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import type { BrandFormInput } from "../model/brand-schema";

const f = dict.brandForm;

/** The logo as the storefront will load it — see `logoSrc` in the list. */
function previewSrc(logo: string): string {
  if (!logo.startsWith("/") || logo.startsWith("//")) return logo;
  try {
    return new URL(logo, STOREFRONT_URL).toString();
  } catch {
    return logo;
  }
}

/**
 * The brand card without `brands:write` (TASK-667 template, БР9): the form's
 * sections «Основне · Логотип · Показувати на сайті» as text, the side panel
 * kept, no uploader and no save bar.
 */
export function BrandReadOnly({
  values,
  aside,
}: {
  values: BrandFormInput;
  aside?: ReactNode;
}) {
  const slug = values.slug?.trim() ?? "";
  const logo = values.logo?.trim() ?? "";
  return (
    <div className="flex flex-col gap-4">
      <ReadOnlyNotice>{dict.readOnlyView.notices.brands}</ReadOnlyNotice>
      <ReadOnlyLayout aside={aside}>
        <ReadOnlySection title={f.sectionMain}>
          <ReadOnlyField label={f.name}>{values.name}</ReadOnlyField>
          <ReadOnlyField label={f.slug} mono>
            {slug ? (
              <ReadOnlyLink
                href={`${STOREFRONT_URL}/catalog?brand=${encodeURIComponent(slug)}`}
                external
              >
                {slug}
              </ReadOnlyLink>
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>
        <ReadOnlySection title={f.sectionLogo}>
          <ReadOnlyField
            label={f.logoUpload.alt}
            emptyConsequence={dict.readOnlyView.brandLogoEmpty}
          >
            {logo ? (
              <ReadOnlyImage src={previewSrc(logo)} alt={f.logoUpload.alt} />
            ) : null}
          </ReadOnlyField>
        </ReadOnlySection>
        <ReadOnlySection title={f.active}>
          <ReadOnlyField label={f.active}>
            <ReadOnlyBool
              value={values.isActive ?? true}
              on={dict.brands.statusActive}
              off={dict.brands.statusInactive}
            />
          </ReadOnlyField>
        </ReadOnlySection>
      </ReadOnlyLayout>
    </div>
  );
}
