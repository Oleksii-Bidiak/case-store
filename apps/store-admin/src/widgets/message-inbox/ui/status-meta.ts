import { ContactMessageEntityStatus } from "@/entities/contact";
import { dict } from "@/shared/config";

/** Localised label for a contact-message status. */
export function statusLabel(status: string): string {
  switch (status) {
    case ContactMessageEntityStatus.NEW:
      return dict.messages.statusNew;
    case ContactMessageEntityStatus.IN_PROGRESS:
      return dict.messages.statusInProgress;
    case ContactMessageEntityStatus.READ:
      return dict.messages.statusRead;
    case ContactMessageEntityStatus.ARCHIVED:
      return dict.messages.statusArchived;
    // TASK-761: a honeypot hit, kept so a false positive can be spotted.
    case ContactMessageEntityStatus.SPAM:
      return dict.messages.statusSpam;
    default:
      return status;
  }
}

/**
 * Badge visual variant per status — NEW stands out, IN_PROGRESS warns that
 * someone is actively on it (TASK-256), the rest are muted.
 */
export function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "warning" {
  switch (status) {
    case ContactMessageEntityStatus.NEW:
      return "default";
    case ContactMessageEntityStatus.IN_PROGRESS:
      return "warning";
    case ContactMessageEntityStatus.READ:
      return "secondary";
    default:
      return "outline";
  }
}
