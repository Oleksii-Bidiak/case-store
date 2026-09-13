"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListUserNotesQueryKey,
  useCreateUserNote,
  useListUserNotes,
  type UserNoteEntity,
} from "@/entities/user";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { toast } from "@/shared/ui/toast";
import { Button, Label, Skeleton, Textarea } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.users;

/**
 * Mirrors `USER_NOTE_MAX_LENGTH` in `apps/store-api/src/user-note/dto`. The SERVER
 * is the authority — it answers 400 — and this copy exists only so the operator
 * sees the ceiling while typing instead of losing a long note to a rejection.
 *
 * Kept as a local constant rather than hidden inside the component: the generated
 * `CreateUserNoteDto` carries `@maxLength 2000` in its JSDoc, so if the API ever
 * changes the limit the drift is visible in the generated diff right next to this
 * feature's only other API contact.
 */
const USER_NOTE_MAX_LENGTH = 2000;

interface UserNotesPanelProps {
  userId: string;
}

/**
 * The customer-notes journal (TASK-430).
 *
 * ── Why a journal and not an editable field ─────────────────────────────────
 * The owner decided the shape on 2026-09-11. The cheap version — one `notes`
 * column on the customer, like `Order.internalNotes` — is useless to a team,
 * because the only way to add to it is to overwrite what a colleague wrote:
 * «передзвонити після 18:00» replaced by «просив рахунок на ФОП», with nothing
 * left to show the first note existed. So entries accumulate, each stamped with
 * an author and a time, and there is no edit and no delete anywhere in the
 * stack — not in this component, not on the API, not in the repository.
 *
 * ── Who sees it, who can write ──────────────────────────────────────────────
 * Reading needs `customers:read`, which anyone who can open this card already
 * holds. The FORM is rendered only for `customers:write`: without it the POST
 * answers 403, and a textarea that always fails is worse than no textarea. The
 * server enforces both — this is the UI half of the same rule.
 *
 * The notes are staff-only and no storefront route can return them
 * (`admin-user-note.controller.spec.ts` proves that by walking every controller).
 *
 * ── The textarea's state ────────────────────────────────────────────────────
 * Plain `useState`, and that is safe here precisely because nothing seeds it from
 * server data: a new note always starts empty (docs/conventions/forms.md is about
 * async-seeded inputs). It is cleared only on a confirmed success, so a failed
 * POST leaves the text the operator typed in the box.
 */
export function UserNotesPanel({ userId }: UserNotesPanelProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [body, setBody] = useState("");

  const { data, isLoading, isError } = useListUserNotes(userId);
  const create = useCreateUserNote();

  const notes = data?.data ?? [];
  const total = data?.meta?.total ?? notes.length;
  // `PERM.customersWrite`, never the bare string: `can()` is typed
  // `(permission: string) => boolean`, so a typo here compiles, passes review and
  // then hides this form from every MANAGER who actually holds the right — and
  // nobody notices, because the owner is ADMIN and `can()` says true for them
  // whatever they ask.
  const canWrite = can(PERM.customersWrite);
  const trimmed = body.trim();
  const remaining = USER_NOTE_MAX_LENGTH - body.length;
  const tooLong = body.length > USER_NOTE_MAX_LENGTH;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || tooLong || create.isPending) {
      return;
    }

    create.mutate(
      { userId, data: { body: trimmed } },
      {
        onSuccess: () => {
          // Clear only now: a 400 or a dropped connection must not eat the text.
          setBody("");
          void queryClient.invalidateQueries({
            queryKey: getListUserNotesQueryKey(userId),
          });
          toast.success(d.notesToastAdded);
        },
        onError: () => toast.error(d.notesToastFailed),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{d.notesIntro}</p>

      {canWrite && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Label htmlFor="user-note-body">{d.notesAddLabel}</Label>
          <Textarea
            id="user-note-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={d.notesAddPlaceholder}
            rows={3}
            aria-invalid={tooLong || undefined}
            aria-describedby="user-note-body-counter"
            disabled={create.isPending}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              id="user-note-body-counter"
              className={
                tooLong
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {tooLong
                ? d.notesTooLong(USER_NOTE_MAX_LENGTH)
                : d.notesCharsLeft(remaining)}
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={!trimmed || tooLong || create.isPending}
            >
              {create.isPending && (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              )}
              {d.notesAddSubmit}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.notesLoadError}
        </p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{d.notesEmpty}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} />
            ))}
          </ul>
          {/* The read is capped server-side. Say so rather than truncate in
              silence — an operator who cannot see an old note needs to know it is
              still there. */}
          {total > notes.length && (
            <p className="text-xs text-muted-foreground">
              {d.notesTruncated(notes.length, total)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One entry: date · author · text.
 *
 * `authorEmail` is the SNAPSHOT the API stored when the note was written, not a
 * join, so an entry stays readable after the staff account is deleted — the same
 * decision as the audit log's `actorEmail`. A null author (which the schema
 * allows) says so in words instead of rendering a blank.
 */
function NoteItem({ note }: { note: UserNoteEntity }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <time
          dateTime={note.createdAt}
          className="text-xs text-muted-foreground"
        >
          {formatDateTime(note.createdAt)}
        </time>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          ·
        </span>
        <span className="text-xs font-medium text-foreground">
          {note.authorEmail ?? d.notesAuthorUnknown}
        </span>
      </div>
      {/* `whitespace-pre-wrap`: the operator's line breaks are part of the note
          («подзвонити / перевірити адресу»), and the body is plain text — never
          HTML, so React's own escaping is the whole sanitisation story. */}
      <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
    </li>
  );
}
