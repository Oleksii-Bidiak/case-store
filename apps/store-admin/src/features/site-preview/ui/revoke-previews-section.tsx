"use client";

import { Link2OffIcon } from "lucide-react";
import { useAdminPreviewTokenControllerRevokeAll } from "@/shared/api";
import { Button, Callout, useConfirmDialog } from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";

const t = dict.sitePreview;

/** Anchor of the section — the SEO page's section nav links to it. */
export const PREVIEW_SETTINGS_SECTION_ID = "seo-previews";

/**
 * «Прев'ю чернеток» on /settings/seo (TASK-670, SitePreview ДП-8/ДП-9): what a
 * preview link is, and the one way to take them back — all at once. The API
 * bumps a generation on the SEO settings row, so every link issued so far stops
 * opening drafts; there is no per-link revoke by design (plan 186, TASK-668).
 *
 * The route needs `settings:seo`; the page that composes this gates it.
 */
export function RevokePreviewsSection() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const revoke = useAdminPreviewTokenControllerRevokeAll();

  const handleRevoke = async () => {
    const confirmed = await confirm({
      title: t.revokeTitle,
      description: t.revokeBody,
      confirmLabel: t.revokeConfirm,
      destructive: true,
    });
    if (!confirmed) return;
    revoke.mutate(undefined, {
      onSuccess: () => toast.success(t.toastRevoked),
      onError: () => toast.error(t.toastRevokeFailed),
    });
  };

  return (
    <FormSectionCard
      id={PREVIEW_SETTINGS_SECTION_ID}
      title={t.settingsHeading}
      description={t.settingsIntro}
    >
      <Callout>{t.settingsRevokeNote}</Callout>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={revoke.isPending}
          onClick={() => void handleRevoke()}
          className="text-destructive hover:text-destructive max-md:min-h-11"
        >
          <Link2OffIcon aria-hidden="true" />
          {t.revokeAll}
        </Button>
      </div>
      {confirmDialog}
    </FormSectionCard>
  );
}
