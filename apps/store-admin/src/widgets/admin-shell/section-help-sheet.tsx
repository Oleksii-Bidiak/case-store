"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/entities/session";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui";
import { dict } from "@/shared/config";
import { joinPhrases, resolveHelpSection } from "./model/help-content";

interface SectionHelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Довідка · <розділ>» (TASK-1034/1035) — what the current section is for and
 * what THIS person may do in it, read from the same permissions the nav and
 * every button use. The rights paragraph is the honest answer to "why is there
 * no refund button for me?": it names what is missing and who can grant it.
 *
 * The «Повний посібник адміністратора» link from the artboard is NOT rendered:
 * `docs/admin-guide.md` is not served by the app and has no hosted URL in
 * config, and a dead link is worse than none (API/ops tail of TASK-1035).
 */
export function SectionHelpSheet({
  open,
  onOpenChange,
}: SectionHelpSheetProps) {
  const pathname = usePathname();
  const { isAdmin, can } = useAuth();
  const section = resolveHelpSection(pathname);

  const held = section.rights.filter((right) => can(right.permission));
  const missing = section.rights.filter((right) => !can(right.permission));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* No SheetDescription: the sections below are the content, and a
          duplicate sr-only line would be read twice. */}
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-sm"
        aria-describedby={undefined}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-lg">
            {dict.header.sectionHelpTitle(section.title)}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.header.sectionHelpWhat}
            </h3>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-foreground">
              {section.what.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {dict.header.sectionHelpRights}
            </h3>
            {section.rights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {dict.header.sectionHelpNoRightNeeded}
              </p>
            ) : isAdmin ? (
              <p className="text-sm text-muted-foreground">
                {dict.header.sectionHelpAllRights}
              </p>
            ) : (
              <>
                {held.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {dict.header.sectionHelpCan(
                      joinPhrases(held.map((right) => right.phrase)),
                    )}
                  </p>
                )}
                {missing.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {dict.header.sectionHelpCannot(
                      joinPhrases(missing.map((right) => right.phrase)),
                      dict.nav.staff,
                    )}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
