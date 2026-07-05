import { ContactMessageEntityStatus } from "@/entities/contact";
import { dict } from "@/shared/config";

/** Localised label for a contact-message status. */
export function statusLabel(status: string): string {
  switch (status) {
    case ContactMessageEntityStatus.NEW:
      return dict.messages.statusNew;
    case ContactMessageEntityStatus.READ:
      return dict.messages.statusRead;
    case ContactMessageEntityStatus.ARCHIVED:
      return dict.messages.statusArchived;
    default:
      return status;
  }
}

/** Badge visual variant per status — NEW stands out, the rest are muted. */
export function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" {
  switch (status) {
    case ContactMessageEntityStatus.NEW:
      return "default";
    case ContactMessageEntityStatus.READ:
      return "secondary";
    default:
      return "outline";
  }
}
