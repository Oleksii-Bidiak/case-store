import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StaleDraftPanel } from "./stale-draft-panel";

const LABELS = {
  title: "Хтось інший змінив замовлення",
  diverging: "Колега змінив ті самі поля",
  refreshed: "Оновили поля колеги",
  theirs: "Версія колеги",
  mine: "Ваша чернетка",
  empty: "—",
  takeTheirs: "Взяти версію колеги",
  keepMine: "Зберегти мою",
  acknowledge: "Зрозуміло",
};

describe("StaleDraftPanel (TASK-1972, review R3)", () => {
  it("takes focus when it appears — «Зберегти» under it is now disabled", () => {
    render(
      <StaleDraftPanel
        rows={[]}
        labels={LABELS}
        onTakeTheirs={jest.fn()}
        onAcknowledge={jest.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("hands the row's field back on «Взяти версію колеги»", async () => {
    const onTakeTheirs = jest.fn();
    render(
      <StaleDraftPanel
        rows={[
          { name: "city", label: "Місто", theirs: "Одеса", mine: "Львів" },
        ]}
        labels={LABELS}
        onTakeTheirs={onTakeTheirs}
        onAcknowledge={jest.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: LABELS.takeTheirs }),
    );

    expect(onTakeTheirs).toHaveBeenCalledWith("city");
  });
});
