import * as React from "react";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import {
  CheckList,
  DateRange,
  FilterSection,
  FilterSheet,
  PillGroup,
  RangeInputs,
  useFilterDraft,
} from ".";

/**
 * «Фільтри» is a side sheet whose edits are a DRAFT until «Показати…»
 * (OrdersProposal П6/П8). Applying on every click would refetch the list under
 * the operator's hands while they are still choosing, and «Скинути» inside the
 * sheet would wipe the list before they decided to.
 */

const r = dict.common.registry;

interface Filters {
  payment: string;
  statuses: string[];
  sumFrom: string;
  sumTo: string;
  period: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY: Filters = {
  payment: "",
  statuses: [],
  sumFrom: "",
  sumTo: "",
  period: "",
  dateFrom: "",
  dateTo: "",
};

function Harness({
  applied,
  onApply,
}: {
  applied: Filters;
  onApply: (next: Filters) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { draft, update, reset } = useFilterDraft(applied, open);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <FilterSheet
        open={open}
        onOpenChange={setOpen}
        applyLabel="Показати 27 замовлень"
        onReset={() => reset(EMPTY)}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        <FilterSection title="Оплата">
          <PillGroup
            label="Оплата"
            options={[
              { value: "", label: "Будь-яка оплата" },
              { value: "PAID", label: "Оплачено" },
            ]}
            value={draft.payment}
            onChange={(payment) => update({ payment })}
          />
        </FilterSection>
        <FilterSection title="Статус замовлення">
          <CheckList
            label="Статус замовлення"
            columns={2}
            items={[
              { value: "NEW", label: "Нове", count: 3 },
              { value: "SHIPPED", label: "Відправлено", count: 9 },
            ]}
            value={draft.statuses}
            onChange={(statuses) => update({ statuses })}
          />
        </FilterSection>
        <FilterSection title="Сума, ₴" suffix="— після плану 184">
          <RangeInputs
            legend="Сума"
            from={draft.sumFrom}
            to={draft.sumTo}
            onChange={({ from, to }) => update({ sumFrom: from, sumTo: to })}
          />
        </FilterSection>
        <FilterSection title="Період (створено)">
          <DateRange
            legend="Період"
            presets={[
              { id: "today", label: "Сьогодні" },
              { id: "custom", label: "Свій період" },
            ]}
            preset={draft.period}
            onPresetChange={(period) => update({ period })}
            from={draft.dateFrom}
            to={draft.dateTo}
            onChange={({ from, to }) => update({ dateFrom: from, dateTo: to })}
          />
        </FilterSection>
      </FilterSheet>
    </>
  );
}

describe("FilterSheet — draft, then apply", () => {
  it("changes nothing until «Показати…», then hands over the whole draft", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness applied={EMPTY} onApply={onApply} />);
    await user.click(screen.getByRole("button", { name: "open" }));

    const sheet = screen.getByRole("dialog", { name: r.sheetTitle });
    const paid = within(sheet).getByRole("button", { name: "Оплачено" });
    expect(paid).toHaveAttribute("aria-pressed", "false");
    await user.click(paid);
    expect(paid).toHaveAttribute("aria-pressed", "true");
    // Single-choice: the other pill is released.
    expect(
      within(sheet).getByRole("button", { name: "Будь-яка оплата" }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(within(sheet).getByRole("checkbox", { name: /Нове/ }));
    await user.type(
      within(sheet).getByRole("textbox", { name: r.rangeFromAria("Сума") }),
      "100",
    );
    await user.click(within(sheet).getByRole("button", { name: "Сьогодні" }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(
      within(sheet).getByRole("button", { name: "Показати 27 замовлень" }),
    );
    expect(onApply).toHaveBeenCalledWith({
      ...EMPTY,
      payment: "PAID",
      statuses: ["NEW"],
      sumFrom: "100",
      period: "today",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("throws the draft away when the sheet is closed without applying", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness applied={{ ...EMPTY, payment: "PAID" }} onApply={onApply} />,
    );
    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "Будь-яка оплата" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Re-opening starts from what is APPLIED, not from the abandoned draft.
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("button", { name: "Оплачено" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("«Скинути» clears the draft only — applying is still a separate step", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        applied={{ ...EMPTY, payment: "PAID", statuses: ["NEW"] }}
        onApply={onApply}
      />,
    );
    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: r.sheetReset }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Нове/ })).not.toBeChecked();
    await user.click(
      screen.getByRole("button", { name: "Показати 27 замовлень" }),
    );
    expect(onApply).toHaveBeenCalledWith(EMPTY);
  });

  it("labels each section and shows a dimmed suffix and the counts", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness applied={EMPTY} onApply={() => {}} />);
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByText("— після плану 184")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Статус замовлення" }),
    ).toHaveTextContent("Відправлено9");
  });
});

describe("PillGroup — multi", () => {
  it("toggles several values independently", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <PillGroup
        multiple
        label="Доставка"
        options={[
          { value: "branch", label: "Відділення НП" },
          { value: "locker", label: "Поштомат НП", isNew: true },
        ]}
        value={["branch"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Доставка" })).toBeInTheDocument();
    expect(screen.getByText(r.newTag)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Поштомат НП/ }));
    expect(onChange).toHaveBeenCalledWith(["branch", "locker"]);
    await user.click(screen.getByRole("button", { name: "Відділення НП" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("CheckList — tree rows", () => {
  const TREE = [
    {
      value: "cases",
      label: "Чохли",
      children: [
        { value: "iphone", label: "Чохли для iPhone" },
        { value: "samsung", label: "Чохли для Samsung" },
      ],
    },
  ];

  it("shows a parent as mixed when only some children are on, and selects the branch from it", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <CheckList
        label="Категорія"
        items={TREE}
        value={["iphone"]}
        onChange={onChange}
      />,
    );
    const parent = screen.getByRole("checkbox", { name: "Чохли" });
    expect(parent).toHaveAttribute("aria-checked", "mixed");
    await user.click(parent);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining(["cases", "iphone", "samsung"]),
    );

    rerender(
      <CheckList
        label="Категорія"
        items={TREE}
        value={["cases", "iphone", "samsung"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Чохли" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Чохли" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
