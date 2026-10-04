"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { useProductControllerFindAll } from "@/entities/product";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { cn } from "@/shared/lib/utils";
import {
  Badge,
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  SITE_SECTIONS,
  categoryHref,
  flattenCategoryPaths,
  productHref,
  resolveLink,
  type LinkKind,
} from "../model/link-target";

const l = dict.linkPicker;
const SEARCH_DEBOUNCE_MS = 300;
const PRODUCT_LIMIT = 8;

const KIND_LABEL: Record<LinkKind, string> = {
  section: l.tabSection,
  category: l.tabCategory,
  product: l.tabProduct,
  custom: l.tabCustom,
};

export interface LinkPickerProps {
  /** The trigger's id — the host's `<Label htmlFor>` names it. */
  id: string;
  /** The stored address: `/products`, `/categories/glass`, `https://…`, or "". */
  value: string;
  onChange: (href: string) => void;
  invalid?: boolean;
  /** Extra ids for `aria-describedby` (a field error). */
  describedBy?: string;
  disabled?: boolean;
}

/**
 * «Куди веде кнопка» (BannersProposal БН6, wave 198): a site section, a
 * category, a product, or any address («Своє»). Whatever is picked becomes the
 * SAME address string the field always stored — `/categories/<slug>`,
 * `/products/<slug>` — so the API and the storefront see no difference, and an
 * address the picker does not recognise is shown back as «Своє», untouched.
 *
 * Categories and products come from the PUBLIC endpoints: a link may only point
 * at what the shop shows, and those need no catalogue permission.
 */
export function LinkPicker({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  disabled = false,
}: LinkPickerProps) {
  const hintId = useId();
  const contentId = useId();
  const [open, setOpen] = useState(false);
  /** Names of products picked in this session, keyed by their address. */
  const [productNames, setProductNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  const isCategoryLink = value.trim().startsWith("/categories/");
  // Loaded when the picker opens, or to name a stored category link.
  const categoriesQuery = useCategoryControllerGetCategoryTree({
    query: { enabled: open || isCategoryLink },
  });
  const categories = useMemo(
    () => flattenCategoryPaths(categoriesQuery.data?.data),
    [categoriesQuery.data],
  );

  const resolved = resolveLink(value, categories, productNames);
  const [tab, setTab] = useState<LinkKind>(resolved?.kind ?? "section");

  const pick = (href: string, productName?: string) => {
    if (productName) {
      setProductNames((current) => new Map(current).set(href, productName));
    }
    onChange(href);
    setOpen(false);
  };

  const describedByIds = [resolved ? hintId : undefined, describedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setTab(resolved?.kind ?? "section");
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            // A combobox whose popup is a dialog (ARIA 1.2): it names the
            // chosen address and can carry `aria-invalid`, which a plain
            // button cannot. Radix adds aria-haspopup / -expanded / -controls.
            role="combobox"
            aria-expanded={open}
            aria-controls={contentId}
            id={id}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedByIds || undefined}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background py-1 pr-2 pl-3 text-left text-sm outline-none transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {resolved ? (
                <>
                  <Badge variant="secondary">{KIND_LABEL[resolved.kind]}</Badge>
                  <span className="truncate text-foreground">
                    {resolved.label}
                  </span>
                </>
              ) : (
                <span className="truncate text-muted-foreground">
                  {l.placeholder}
                </span>
              )}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          id={contentId}
          className="w-(--radix-popover-trigger-width) min-w-72 p-1.5"
        >
          <Tabs value={tab} onValueChange={(next) => setTab(next as LinkKind)}>
            <TabsList className="w-full">
              <TabsTrigger value="section">{l.tabSection}</TabsTrigger>
              <TabsTrigger value="category">{l.tabCategory}</TabsTrigger>
              <TabsTrigger value="product">{l.tabProduct}</TabsTrigger>
              <TabsTrigger value="custom">{l.tabCustom}</TabsTrigger>
            </TabsList>

            <TabsContent value="section">
              <OptionList>
                {SITE_SECTIONS.map((section) => (
                  <Option
                    key={section.href}
                    selected={value === section.href}
                    label={section.label}
                    href={section.href}
                    onPick={() => pick(section.href)}
                  />
                ))}
              </OptionList>
            </TabsContent>

            <TabsContent value="category">
              <CategoryTab
                value={value}
                isLoading={categoriesQuery.isLoading}
                isError={categoriesQuery.isError}
                categories={categories}
                onPick={(slug) => pick(categoryHref(slug))}
              />
            </TabsContent>

            <TabsContent value="product">
              <ProductTab
                value={value}
                onPick={(slug, name) => pick(productHref(slug), name)}
              />
            </TabsContent>

            <TabsContent value="custom">
              <CustomTab
                initial={resolved?.kind === "custom" ? value : ""}
                onApply={(href) => pick(href)}
              />
            </TabsContent>
          </Tabs>

          <div className="mt-1.5 flex flex-col gap-1 border-t border-border px-2 pt-2 pb-1">
            <p className="text-xs text-muted-foreground">{l.footerHint}</p>
            {value.trim() !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start text-destructive hover:text-destructive"
                onClick={() => pick("")}
              >
                {l.clear}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {resolved && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {l.leadsTo}{" "}
          <span className="font-mono break-all text-primary">
            {value.trim()}
          </span>
          {resolved.note ? ` — ${resolved.note}.` : "."}
        </p>
      )}
    </div>
  );
}

function OptionList({ children }: { children: React.ReactNode }) {
  return <ul className="flex max-h-64 flex-col overflow-y-auto">{children}</ul>;
}

function Option({
  label,
  href,
  selected,
  onPick,
}: {
  label: string;
  href: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onPick}
        className={cn(
          "flex min-h-9 w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
          selected && "bg-accent",
        )}
      >
        <span className="min-w-0 truncate text-foreground">{label}</span>
        <span className="shrink-0 truncate font-mono text-xs text-primary">
          {href}
        </span>
      </button>
    </li>
  );
}

function SearchBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative mb-1.5">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        className="pl-8"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
    </div>
  );
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-2 text-sm text-muted-foreground">{children}</p>;
}

function CategoryTab({
  value,
  isLoading,
  isError,
  categories,
  onPick,
}: {
  value: string;
  isLoading: boolean;
  isError: boolean;
  categories: ReturnType<typeof flattenCategoryPaths>;
  onPick: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? categories.filter(
        (category) =>
          category.label.toLowerCase().includes(needle) ||
          category.slug.includes(needle),
      )
    : categories;

  return (
    <>
      <SearchBox label={l.categorySearch} value={query} onChange={setQuery} />
      {isLoading ? (
        <StatusLine>{l.loading}</StatusLine>
      ) : isError ? (
        <p role="alert" className="px-2 py-2 text-sm text-destructive">
          {l.loadError}
        </p>
      ) : shown.length === 0 ? (
        <StatusLine>{l.empty}</StatusLine>
      ) : (
        <OptionList>
          {shown.map((category) => (
            <Option
              key={category.id}
              label={category.label}
              href={categoryHref(category.slug)}
              selected={value === categoryHref(category.slug)}
              onPick={() => onPick(category.slug)}
            />
          ))}
        </OptionList>
      )}
    </>
  );
}

function ProductTab({
  value,
  onPick,
}: {
  value: string;
  onPick: (slug: string, name: string) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedCallback((next: string) => {
    setSearch(next.trim());
  }, SEARCH_DEBOUNCE_MS);

  const query = useProductControllerFindAll(
    { search, page: 1, limit: PRODUCT_LIMIT },
    { query: { enabled: search.length > 0 } },
  );
  const results = search.length > 0 ? (query.data?.data ?? []) : [];

  return (
    <>
      <SearchBox
        label={l.productSearch}
        value={input}
        onChange={(next) => {
          setInput(next);
          debounced(next);
        }}
      />
      {search.length === 0 ? (
        <StatusLine>{l.productSearchHint}</StatusLine>
      ) : query.isLoading ? (
        <StatusLine>{l.loading}</StatusLine>
      ) : query.isError ? (
        <p role="alert" className="px-2 py-2 text-sm text-destructive">
          {l.loadError}
        </p>
      ) : results.length === 0 ? (
        <StatusLine>{l.empty}</StatusLine>
      ) : (
        <OptionList>
          {results.map((product) => (
            <Option
              key={product.id}
              label={product.name}
              href={productHref(product.slug)}
              selected={value === productHref(product.slug)}
              onPick={() => onPick(product.slug, product.name)}
            />
          ))}
        </OptionList>
      )}
    </>
  );
}

function CustomTab({
  initial,
  onApply,
}: {
  initial: string;
  onApply: (href: string) => void;
}) {
  const inputId = useId();
  // Seeded once per mount from a synchronous prop: the tab remounts every time
  // the popover opens, so there is no async value to fall out of sync with.
  const [draft, setDraft] = useState(initial);
  const apply = () => {
    if (draft.trim() !== "") onApply(draft.trim());
  };
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1">
      <Label htmlFor={inputId}>{l.customLabel}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          placeholder={l.customPlaceholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        <Button type="button" onClick={apply} disabled={draft.trim() === ""}>
          {l.customApply}
        </Button>
      </div>
    </div>
  );
}
