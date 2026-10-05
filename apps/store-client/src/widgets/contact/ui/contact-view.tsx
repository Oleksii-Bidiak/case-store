import Link from "next/link";
import {
  Phone,
  Mail,
  MessageCircle,
  Clock,
  ShoppingCart,
  Wrench,
  Building2,
  HelpCircle,
  Send,
  Camera,
  type LucideIcon,
} from "lucide-react";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { dict, H1_CLASS } from "@/shared/config";
import { Button } from "@/shared/ui";
import { ContactForm } from "./contact-form";

// Configured messenger links on SiteContactSettings (TASK-154) → real chat links.
const MESSENGERS: {
  key: "telegramLink" | "viberLink" | "instagramLink";
  icon: LucideIcon;
  label: string;
}[] = [
  { key: "telegramLink", icon: Send, label: "Telegram" },
  { key: "viberLink", icon: MessageCircle, label: "Viber" },
  { key: "instagramLink", icon: Camera, label: "Instagram" },
];

const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  sales: ShoppingCart,
  service: Wrench,
  b2b: Building2,
};

const CARD =
  "block rounded-2xl border border-border bg-card p-[22px] no-underline shadow-card transition-[border-color,box-shadow] hover:border-primary hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHANNEL_ICON =
  "mb-3.5 inline-flex size-[46px] items-center justify-center rounded-xl bg-primary/12 text-primary";

/**
 * ContactView — the `/contact` page (Contact.dc.html redesign). A gradient hero,
 * four quick-contact channels, the message form (stub) + a side column
 * (departments / messengers) and a FAQ strip. Contact details,
 * working hours and messenger links come from the real admin-managed
 * SiteContactSettings (TASK-154) with localized fallbacks; the form has no
 * backend yet (TASK-177). Server component — only the form is interactive.
 */
export function ContactView({
  contact,
}: {
  contact: SiteContactSettingsEntity | null;
}) {
  const d = dict.contact;
  const phone = contact?.phone ?? dict.footer.contactPhone;
  const email = contact?.email ?? dict.footer.contactEmail;
  const hours = contact?.workingHours ?? dict.footer.contactHours;
  const messengers = MESSENGERS.filter((m) => contact?.[m.key]);

  return (
    <div>
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[18px] flex items-center gap-2.5 text-sm text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {d.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">{d.breadcrumb}</span>
      </nav>

      {/* Hero — padding steps up with the viewport; a flat p-11 left ~270px of
          copy at 390 (TASK-878). */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6 rounded-2xl bg-brand-gradient p-6 text-white sm:gap-8 sm:p-8 lg:p-11">
        <div className="max-w-[560px]">
          <h1 className={`mb-3 ${H1_CLASS}`}>{d.heading}</h1>
          <p className="text-base leading-relaxed opacity-95">{d.intro}</p>
        </div>
        <div className="flex gap-7">
          {d.stats.map((stat) => (
            <div key={stat.label}>
              <span className="block font-display text-3xl font-bold">
                {stat.value}
              </span>
              <span className="text-[13px] opacity-85">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick contact channels */}
      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className={CARD}>
          <span className={CHANNEL_ICON}>
            <Phone className="size-[21px]" aria-hidden="true" />
          </span>
          <span className="mb-1 block text-xs text-muted-foreground">
            {d.channels.phoneLabel}
          </span>
          <b className="block font-mono text-[17px] text-foreground">{phone}</b>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {d.channels.phoneNote}
          </span>
        </a>

        <a href={`mailto:${email}`} className={CARD}>
          <span className={CHANNEL_ICON}>
            <Mail className="size-[21px]" aria-hidden="true" />
          </span>
          <span className="mb-1 block text-xs text-muted-foreground">
            {d.channels.emailLabel}
          </span>
          <b className="block text-[17px] break-all text-foreground">{email}</b>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {d.channels.emailNote}
          </span>
        </a>

        <a href="#messengers" className={CARD}>
          <span className={CHANNEL_ICON}>
            <MessageCircle className="size-[21px]" aria-hidden="true" />
          </span>
          <span className="mb-1 block text-xs text-muted-foreground">
            {d.channels.chatLabel}
          </span>
          <b className="block text-[17px] text-foreground">
            {d.channels.chatValue}
          </b>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {d.channels.chatNote}
          </span>
        </a>

        <div
          className={`${CARD} cursor-default hover:border-border hover:shadow-card`}
        >
          <span className={CHANNEL_ICON}>
            <Clock className="size-[21px]" aria-hidden="true" />
          </span>
          <span className="mb-1 block text-xs text-muted-foreground">
            {d.channels.hoursLabel}
          </span>
          <b className="block text-[17px] text-foreground">{hours}</b>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {d.channels.hoursNote}
          </span>
        </div>
      </div>

      {/* Form + side column */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
        <ContactForm />

        <div className="flex flex-col gap-6">
          {/* Departments */}
          <div className="rounded-card border border-border bg-card p-[30px] shadow-card">
            <h2 className="mb-4 font-display text-xl font-bold text-foreground">
              {d.departmentsHeading}
            </h2>
            <div className="flex flex-col gap-1.5">
              {d.departments.map((dep) => {
                const Icon = DEPARTMENT_ICONS[dep.key] ?? Building2;
                return (
                  <div
                    key={dep.key}
                    className="flex items-center gap-3.5 rounded-cta border border-border bg-background p-3.5"
                  >
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-menu bg-primary/12 text-primary">
                      <Icon className="size-[19px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block text-sm text-foreground">
                        {dep.title}
                      </b>
                      <span className="text-xs text-muted-foreground">
                        {dep.desc}
                      </span>
                    </div>
                    {/* TASK-873 — the shop's one support email, with the
                        department as the subject: no per-department
                        mailboxes exist in «Контакти магазину». */}
                    <a
                      href={`mailto:${email}?subject=${encodeURIComponent(dep.title)}`}
                      aria-label={d.departmentWriteAria(dep.title)}
                      className="inline-flex min-h-11 items-center text-sm font-semibold whitespace-nowrap text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {d.departmentWrite}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Messengers */}
          <div
            id="messengers"
            className="scroll-mt-24 rounded-card border border-border bg-card p-[30px] shadow-card"
          >
            <h2 className="mb-1.5 font-display text-xl font-bold text-foreground">
              {d.messengersHeading}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {d.messengersIntro}
            </p>
            {messengers.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {messengers.map((m) => {
                  const Icon = m.icon;
                  return (
                    <a
                      key={m.label}
                      href={contact?.[m.key] as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground no-underline transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="size-[18px]" aria-hidden="true" />
                      {m.label}
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {d.messengersEmpty}
              </p>
            )}
          </div>

          {/* TASK-873 — no office card: «Контакти магазину» stores no address
              yet (TASK-721), and the card showed «[адреса офісу]»,
              «[графік роботи офісу]» and a route to that placeholder. It
              comes back with a real address field. */}
        </div>
      </div>

      {/* FAQ help strip */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-card border border-border bg-card p-[26px] shadow-card">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-cta bg-primary/12 text-primary">
            <HelpCircle className="size-[22px]" aria-hidden="true" />
          </span>
          <div>
            <b className="block font-display text-base text-foreground">
              {d.faqHeading}
            </b>
            <span className="text-sm text-muted-foreground">{d.faqBody}</span>
          </div>
        </div>
        {/* Outline (TASK-865): a detour to the FAQ — the form's submit is
            the page's one primary action (design-system §1). */}
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-11 rounded-cta font-semibold no-underline"
        >
          <Link href="/info#faq">{d.faqCta}</Link>
        </Button>
      </div>
    </div>
  );
}
