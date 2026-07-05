import { Suspense } from "react";
import type { Metadata } from "next";
import { MessageInbox, MessageInboxSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.messages.metaTitle,
};

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-foreground">
        {dict.messages.heading}
      </h2>

      <Suspense fallback={<MessageInboxSkeleton />}>
        <MessageInbox />
      </Suspense>
    </div>
  );
}
