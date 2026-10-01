"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  Gift,
  HelpCircle,
  Info,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Send,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import {
  dict,
  STICKY_ASIDE_TOP,
  type InfoHubSectionKey,
  H1_CLASS,
  H2_CLASS,
} from "@/shared/config";
import { formatMoney } from "@/shared/lib/format";
import {
  ABOUT_STATS,
  ABOUT_VALUES,
  DELIVERY_OPTIONS,
  INFO_FAQS,
  INFO_SECTIONS,
  PAYMENT_OPTIONS,
  WARRANTY_CARDS,
  type InfoAbout,
  type InfoFaq,
  type InfoIconKey,
  type InfoPageLink,
  type InfoSectionKey,
  type InfoSectionPage,
  type InfoSectionSource,
  type InfoService,
} from "../model/info-content";
import { InfoContactForm } from "./info-contact-form";

const NAV_ICONS: Record<InfoSectionKey, LucideIcon> = {
  delivery: Truck,
  warranty: ShieldCheck,
  faq: HelpCircle,
  about: Info,
  contacts: Phone,
};

const CONTENT_ICONS: Record<InfoIconKey, LucideIcon> = {
  np: Package,
  courier: Truck,
  pickup: Store,
  card: CreditCard,
  wallet: Wallet,
  gift: Gift,
  shield: ShieldCheck,
  screen: Smartphone,
  warranty: BadgeCheck,
};

const PRIMARY_TINT = {
  background:
    "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
};
const SUCCESS_TINT = {
  background:
    "color-mix(in oklab, var(--color-success) 12%, var(--color-card))",
};

const CARD = "rounded-card border border-border bg-card p-[30px] shadow-card";
const SECTION_HEADING =
  "mb-1.5 font-display text-2xl font-bold text-foreground";
const SECTION_INTRO = "mb-[22px] text-sm leading-[1.6] text-muted-foreground";
const SUB_HEADING = "mb-3.5 font-display text-lg font-bold text-foreground";

/** No page read at all (a test, or a caller that has none): the static copy. */
const OFFLINE_SECTIONS: Record<InfoHubSectionKey, InfoSectionSource> = {
  delivery: "unavailable",
  payment: "unavailable",
  warranty: "unavailable",
  aboutStats: "unavailable",
};

/**
 * One /info block: its CMS page, the static fallback when the API is down, or
 * nothing when the owner unpublished / deleted the page (TASK-560).
 */
function sectionBlock(
  source: InfoSectionSource,
  fallback: () => React.ReactNode,
  headingLevel: "h2" | "h3" = "h2",
): React.ReactNode {
  if (source === "missing") return null;
  if (source === "unavailable") return fallback();
  return <CmsSectionCard page={source} headingLevel={headingLevel} />;
}

const MESSENGERS: {
  key: keyof SiteContactSettingsEntity;
  icon: LucideIcon;
  label: string;
}[] = [
  { key: "telegramLink", icon: Send, label: "Telegram" },
  { key: "viberLink", icon: MessageCircle, label: "Viber" },
  { key: "instagramLink", icon: Camera, label: "Instagram" },
];

/**
 * InfoView — the "Інформація та підтримка" hub (/info). A sticky side nav
 * switches between support sections (delivery / warranty / faq / about), plus a
 * Contacts section driven by the real SiteContactSettings (TASK-154) with a demo
 * "write to us" form. Section is deep-linkable via the URL hash.
 *
 * Three of the five sections now read real, admin-managed data (contacts, FAQ,
 * and "Про нас" via TASK-435's `about` page). Every one of them falls back to
 * the static copy in `../model/info-content` when its source is missing: this
 * page carries delivery, warranty and contact information, so it renders even
 * with the API down.
 */
export function InfoView({
  contact,
  faqs = INFO_FAQS,
  about = null,
  sections = OFFLINE_SECTIONS,
  services = [],
  pages = [],
}: {
  contact: SiteContactSettingsEntity | null;
  /** FAQ entries from the admin-managed API; falls back to the static
   *  `INFO_FAQS` when the caller passes nothing (offline / error path). */
  faqs?: readonly InfoFaq[];
  /** The `about` page from the CMS (pre-sanitized HTML); null → static copy. */
  about?: InfoAbout | null;
  /** The delivery / payment / warranty / «у цифрах» pages (TASK-560). */
  sections?: Record<InfoHubSectionKey, InfoSectionSource>;
  /** The store's active add-on services with catalog prices (TASK-561). */
  services?: readonly InfoService[];
  /** Published INFO pages /info does not inline, listed as links (TASK-560). */
  pages?: readonly InfoPageLink[];
}) {
  const [section, setSection] = useState<InfoSectionKey>("delivery");
  const [openFaq, setOpenFaq] = useState<Record<number, boolean>>({});
  const d = dict.info;

  // Deep-link support: adopt a valid `#section` hash after mount (rAF-deferred to
  // avoid a hydration mismatch / setState-in-effect).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const hash = window.location.hash.replace("#", "") as InfoSectionKey;
      if (INFO_SECTIONS.includes(hash)) setSection(hash);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function go(key: InfoSectionKey) {
    setSection(key);
    try {
      window.history.replaceState(null, "", `#${key}`);
    } catch {
      /* ignore */
    }
  }

  const phone = contact?.phone ?? dict.footer.contactPhone;
  const email = contact?.email ?? dict.footer.contactEmail;
  const hours = contact?.workingHours ?? dict.footer.contactHours;
  const messengers = MESSENGERS.filter((m) => contact?.[m.key]);

  return (
    <>
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[18px] flex items-center gap-[9px] text-sm text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {d.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">{d.nav[section]}</span>
      </nav>

      <h1 className={`mb-6 ${H1_CLASS} text-foreground`}>{d.heading}</h1>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid items-start gap-8 lg:grid-cols-[248px_1fr]">
        {/* Side nav */}
        <aside
          className={`rounded-2xl border border-border bg-card p-2 shadow-card lg:sticky ${STICKY_ASIDE_TOP}`}
        >
          <nav aria-label={d.navAria} className="flex flex-col">
            {INFO_SECTIONS.map((key) => {
              const NavIcon = NAV_ICONS[key];
              const active = key === section;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => go(key)}
                  aria-current={active ? "true" : undefined}
                  className={`mb-0.5 flex w-full items-center gap-3 rounded-menu px-3.5 py-3 text-left text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <NavIcon className="size-[19px]" aria-hidden="true" />
                  <span className="flex-1">{d.nav[key]}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <section className="min-w-0">
          {section === "delivery" && (
            <div className="flex flex-col gap-[22px]">
              {sectionBlock(sections.delivery, () => (
                <div className={CARD}>
                  <h2 className={SECTION_HEADING}>{d.deliveryHeading}</h2>
                  <p className={SECTION_INTRO}>{d.deliveryIntro}</p>
                  <div className="grid gap-3.5 sm:grid-cols-3">
                    {DELIVERY_OPTIONS.map((opt) => {
                      const Icon = CONTENT_ICONS[opt.icon];
                      return (
                        <div
                          key={opt.title}
                          className="rounded-[14px] border border-border bg-background p-[18px]"
                        >
                          <span
                            className="mb-3 inline-flex size-[42px] items-center justify-center rounded-menu text-primary"
                            style={PRIMARY_TINT}
                          >
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          <b className="mb-1.5 block text-[15px] text-foreground">
                            {opt.title}
                          </b>
                          <p className="mb-2.5 text-[13px] leading-[1.5] text-muted-foreground">
                            {opt.desc}
                          </p>
                          <span className="font-mono text-sm font-bold text-foreground">
                            {opt.price}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {sectionBlock(sections.payment, () => (
                <div className={CARD}>
                  <h2 className={SECTION_HEADING}>{d.paymentHeading}</h2>
                  <p className={SECTION_INTRO}>{d.paymentIntro}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PAYMENT_OPTIONS.map((opt) => {
                      const Icon = CONTENT_ICONS[opt.icon];
                      return (
                        <div
                          key={opt.title}
                          className="flex items-start gap-3.5 rounded-cta border border-border bg-background p-4"
                        >
                          <span
                            className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-md text-success"
                            style={SUCCESS_TINT}
                          >
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          <div>
                            <b className="mb-0.5 block text-sm text-foreground">
                              {opt.title}
                            </b>
                            <span className="text-xs leading-[1.5] text-muted-foreground">
                              {opt.desc}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === "warranty" && (
            <div className="flex flex-col gap-[22px]">
              {sectionBlock(sections.warranty, () => (
                <div className={CARD}>
                  <h2 className={SECTION_HEADING}>{d.warrantyHeading}</h2>
                  <p className={SECTION_INTRO}>{d.warrantyIntro}</p>
                  <div className="grid gap-3.5 sm:grid-cols-3">
                    {WARRANTY_CARDS.map((card) => (
                      <div
                        key={card.title}
                        className="rounded-[14px] border border-border bg-background p-5"
                      >
                        <span className="mb-2 block font-display text-[30px] font-bold text-primary">
                          {card.big}
                        </span>
                        <b className="mb-1.5 block text-sm text-foreground">
                          {card.title}
                        </b>
                        <p className="text-[13px] leading-[1.5] text-muted-foreground">
                          {card.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* TASK-561 — the store's real active add-ons at their catalog
                  prices. No fallback list: when the API is down or nothing is
                  offered, the card is simply absent — the old one advertised
                  three services at prices nobody had entered anywhere. */}
              {services.length > 0 && (
                <div className={CARD}>
                  <h3 className="mb-4 font-display text-lg font-bold text-foreground">
                    {d.servicesHeading}
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {services.map((svc) => (
                      <li
                        key={svc.id}
                        className="flex items-center gap-4 rounded-cta border border-border bg-background px-[18px] py-[15px]"
                      >
                        <span
                          className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-menu text-primary"
                          style={PRIMARY_TINT}
                        >
                          <ShieldCheck className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex-1">
                          <b className="mb-0.5 block text-sm text-foreground">
                            {svc.name}
                          </b>
                          {svc.description && (
                            <span className="text-xs leading-[1.5] text-muted-foreground">
                              {svc.description}
                            </span>
                          )}
                        </div>
                        {/* A product may override the catalog price, so it
                            is a starting price, never "the" price. */}
                        <span className="font-mono text-sm font-bold whitespace-nowrap text-foreground">
                          {d.servicePriceFrom(formatMoney(svc.price))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {section === "faq" && (
            <div className="rounded-card border border-border bg-card px-[30px] py-3.5 shadow-card">
              {faqs.map((faq, i) => {
                const open = !!openFaq[i];
                return (
                  <div
                    key={faq.q}
                    className="border-b border-border last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFaq((prev) => ({ ...prev, [i]: !prev[i] }))
                      }
                      aria-expanded={open}
                      className="flex w-full items-center gap-3.5 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex-1 text-[15.5px] font-semibold text-foreground">
                        {faq.q}
                      </span>
                      <ChevronDown
                        className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                    {open && (
                      <p className="max-w-[680px] pb-5 text-sm leading-[1.65] text-muted-foreground">
                        {faq.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {section === "about" && (
            <div className="flex flex-col gap-[22px]">
              <div
                className="rounded-card p-10 text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 55%, oklch(0.4 0.16 300)))",
                }}
              >
                <h2 className={`mb-3 ${H2_CLASS}`}>
                  {about?.heading ?? d.aboutHeading}
                </h2>
                <p className="max-w-[620px] text-base leading-[1.6] opacity-95">
                  {about?.intro ?? d.aboutIntro}
                </p>
              </div>
              {/* The page body from the CMS. Rendered through the same
                  `legal-doc-body` typography as /legal/<slug> and /info/<slug>,
                  so a document written once looks the same wherever it appears.
                  The HTML was sanitized server-side by the route that loaded it
                  (see /info/page.tsx) — this component never sanitizes, and must
                  never be handed raw admin input. */}
              {about && (
                <div className={CARD}>
                  <div
                    className="legal-doc-body"
                    dangerouslySetInnerHTML={{ __html: about.html }}
                  />
                  {/* Keeps /info/<slug> reachable by navigation, not only from
                      the sitemap: without a link in from somewhere, every help
                      page the owner writes is an orphan. */}
                  <Link
                    href={about.href}
                    className="mt-5 inline-block text-sm font-semibold text-primary hover:underline"
                  >
                    {d.aboutOpenPage}
                  </Link>
                </div>
              )}

              {/* TASK-560 — «у цифрах» and «Чому обирають нас» come from the
                  `info-about-stats` page; the stat tiles and value list below
                  are only the outage fallback. */}
              {sectionBlock(
                sections.aboutStats,
                () => (
                  <>
                    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                      {ABOUT_STATS.map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-[14px] border border-border bg-card p-[22px] text-center shadow-card"
                        >
                          <span className="block font-display text-[30px] font-bold text-primary">
                            {stat.num}
                          </span>
                          <span className="text-[13px] text-muted-foreground">
                            {stat.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className={CARD}>
                      <h3 className={SUB_HEADING}>{d.valuesHeading}</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {ABOUT_VALUES.map((value) => (
                          <div
                            key={value.title}
                            className="flex items-start gap-3.5"
                          >
                            <span
                              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-success"
                              style={SUCCESS_TINT}
                            >
                              <Check
                                className="size-[19px]"
                                aria-hidden="true"
                              />
                            </span>
                            <div>
                              <b className="mb-0.5 block text-sm text-foreground">
                                {value.title}
                              </b>
                              <span className="text-[13px] leading-[1.5] text-muted-foreground">
                                {value.desc}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ),
                "h3",
              )}
            </div>
          )}

          {section === "contacts" && (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <div className={CARD}>
                <h2 className="mb-5 font-display text-2xl font-bold text-foreground">
                  {d.contactsHeading}
                </h2>
                <div className="flex flex-col gap-[18px]">
                  <ContactRow icon={Phone} label={d.contactPhoneLabel}>
                    <a
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      className="font-mono text-[17px] font-bold text-foreground no-underline hover:text-primary"
                    >
                      {phone}
                    </a>
                  </ContactRow>
                  <ContactRow icon={Mail} label={d.contactEmailLabel}>
                    <a
                      href={`mailto:${email}`}
                      className="text-base font-semibold text-foreground no-underline hover:text-primary"
                    >
                      {email}
                    </a>
                  </ContactRow>
                  <ContactRow icon={Clock} label={d.contactHoursLabel}>
                    <b className="text-[15px] text-foreground">{hours}</b>
                  </ContactRow>
                </div>

                {messengers.length > 0 && (
                  <div className="mt-6 border-t border-border pt-[22px]">
                    <span className="mb-2.5 block text-[13px] text-muted-foreground">
                      {d.messengersLabel}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {messengers.map((m) => {
                        const Icon = m.icon;
                        return (
                          <a
                            key={m.label}
                            href={contact?.[m.key] as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-[42px] items-center gap-2 rounded-menu border border-border bg-background px-4 text-sm font-semibold text-foreground no-underline transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Icon className="size-[18px]" aria-hidden="true" />
                            {m.label}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <InfoContactForm />
            </div>
          )}

          {/* TASK-560 — every other published help page. Without a link in
              from somewhere a page the owner writes under «Довідкова» is an
              orphan reachable only from the sitemap. */}
          {pages.length > 0 && (
            <nav aria-label={d.pagesHeading} className={`${CARD} mt-6`}>
              <h2 className={SUB_HEADING}>{d.pagesHeading}</h2>
              <ul className="flex flex-col gap-2.5">
                {pages.map((page) => (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * An /info block rendered from its INFO page (TASK-560) inside the same card
 * frame the static block used. The body goes through the `legal-doc-body`
 * typography, like «Про нас» and `/info/<slug>`. The HTML was sanitized by the
 * route (`app/info/page.tsx`) — this component never sanitizes and must never
 * be handed raw admin input.
 */
function CmsSectionCard({
  page,
  headingLevel,
}: {
  page: InfoSectionPage;
  headingLevel: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className={CARD}>
      <Heading
        className={headingLevel === "h2" ? SECTION_HEADING : SUB_HEADING}
      >
        {page.heading}
      </Heading>
      {page.intro && <p className={SECTION_INTRO}>{page.intro}</p>}
      <div
        className="legal-doc-body"
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-primary"
        style={{
          background:
            "color-mix(in oklab, var(--color-primary) 12%, var(--color-card))",
        }}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <span className="block text-xs text-muted-foreground">{label}</span>
        {children}
      </div>
    </div>
  );
}
