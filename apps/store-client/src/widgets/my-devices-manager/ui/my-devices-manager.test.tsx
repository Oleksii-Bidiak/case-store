/**
 * «Мої пристрої» (TASK-2076): groups, card actions, label editor, forget +
 * undo, the settings switches, the empty state and the two shells.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToast = jest.fn();
jest.mock("sonner", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock("@/entities/device", () => ({
  ...jest.requireActual("@/entities/device"),
  useDeviceModelCatalog: () => ({
    models: [
      { id: "m-15pro", productCount: 128 },
      { id: "m-13", productCount: 52 },
      { id: "m-watch", productCount: 1 },
    ],
    isLoading: false,
    isError: false,
    retry: () => {},
  }),
}));

import {
  addDevice,
  clearMyDevices,
  closeDevicePicker,
  getDevicePickerState,
  readMyDevices,
  type MyDeviceInput,
} from "@/entities/my-devices";
import {
  readMyDevicesSettings,
  resetMyDevicesSettings,
} from "../model/my-devices-settings";
import { MyDevicesManager } from "./my-devices-manager";

const IPHONE_15_PRO: MyDeviceInput = {
  modelId: "m-15pro",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  family: "iphone",
};
const IPHONE_13: MyDeviceInput = {
  modelId: "m-13",
  slug: "iphone-13",
  name: "iPhone 13",
  brandName: "Apple",
  family: "iphone",
  label: "Мама",
};
const WATCH: MyDeviceInput = {
  modelId: "m-watch",
  slug: "apple-watch-series-10-46",
  name: "Apple Watch Series 10 46 мм",
  brandName: "Apple",
  family: "watch",
};

/** Saved oldest → newest, so the LAST argument ends up active. */
function save(...inputs: MyDeviceInput[]) {
  act(() => {
    for (const input of inputs) addDevice(input);
  });
}

const card = (name: string) => screen.getByRole("article", { name });

beforeEach(() => {
  mockToast.mockReset();
  act(() => {
    clearMyDevices();
    closeDevicePicker();
    resetMyDevicesSettings();
  });
});

describe("MyDevicesManager — empty", () => {
  it("shows the empty card with the one «Додати пристрій», which opens the picker", async () => {
    render(<MyDevicesManager shell="page" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Мої пристрої" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ще немає збережених пристроїв" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    const add = screen.getAllByRole("button", { name: "Додати пристрій" });
    expect(add).toHaveLength(1);
    await userEvent.click(add[0]);
    expect(getDevicePickerState().open).toBe(true);
  });
});

describe("MyDevicesManager — with devices", () => {
  it("counts devices in the H1 and groups them by label, «Мої» first", () => {
    save(IPHONE_13, WATCH, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Мої пристрої · 3" }),
    ).toBeInTheDocument();
    const groups = screen.getAllByRole("region");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "Мої",
      "Мама",
    ]);
    expect(within(groups[0]).getByText("2 пристрої")).toBeInTheDocument();
    expect(within(groups[1]).getByText("1 пристрій")).toBeInTheDocument();
    // Active first inside «Мої»: iPhone 15 Pro was saved last.
    expect(
      within(groups[0])
        .getAllByRole("article")
        .map((a) => within(a).getByRole("heading", { level: 3 }).textContent),
    ).toEqual(["iPhone 15 Pro", "Apple Watch Series 10 46 мм"]);
  });

  it("marks the active card and shows how many products fit", () => {
    save(IPHONE_13, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    const active = card("iPhone 15 Pro");
    expect(within(active).getByText("Активний")).toBeInTheDocument();
    expect(
      within(active).getByText("Apple · 128 товарів підходить"),
    ).toBeInTheDocument();
    expect(
      within(active).queryByRole("button", { name: /Показувати для/ }),
    ).not.toBeInTheDocument();
    expect(
      within(active).getByRole("link", { name: /Все для iPhone 15 Pro/ }),
    ).toHaveAttribute("href", "/devices/iphone-15-pro");

    const other = card("iPhone 13");
    expect(within(other).queryByText("Активний")).not.toBeInTheDocument();
    expect(
      within(other).getByText("Apple · 52 товари підходить"),
    ).toBeInTheDocument();
  });

  it("makes a device active with «Показувати для нього» and focuses its hub link", async () => {
    save(WATCH, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    await userEvent.click(
      within(card("Apple Watch Series 10 46 мм")).getByRole("button", {
        name: "Показувати для Apple Watch Series 10 46 мм",
      }),
    );
    expect(readMyDevices()[0].modelId).toBe("m-watch");
    const watch = card("Apple Watch Series 10 46 мм");
    expect(within(watch).getByText("Активний")).toBeInTheDocument();
    expect(
      within(watch).getByRole("link", { name: /Все для Apple Watch/ }),
    ).toHaveFocus();
    expect(
      within(card("iPhone 15 Pro")).queryByText("Активний"),
    ).not.toBeInTheDocument();
  });

  it("opens the picker from the top «Додати пристрій»", async () => {
    save(IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Додати пристрій" }),
    );
    expect(getDevicePickerState().open).toBe(true);
  });
});

describe("MyDevicesManager — labels", () => {
  it("labels a device, which moves it into that group", async () => {
    save(WATCH, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Підписати Apple Watch Series 10 46 мм",
      }),
    );
    const input = screen.getByRole("textbox", { name: "Підпис пристрою" });
    expect(input).toHaveFocus();
    await userEvent.type(input, "  Тато ");
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(readMyDevices().find((d) => d.modelId === "m-watch")?.label).toBe(
      "Тато",
    );
    const tato = screen.getByRole("region", { name: "Тато" });
    expect(
      within(tato).getByRole("button", {
        name: "Змінити підпис Apple Watch Series 10 46 мм",
      }),
    ).toHaveFocus();
  });

  it("fills the field from a suggestion without saving, Enter saves", async () => {
    save(IPHONE_13, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Підписати iPhone 15 Pro" }),
    );
    const chips = within(
      screen.getByRole("group", { name: "Підказки підпису" }),
    ).getAllByRole("button");
    // Labels in use first, then the defaults — five in total.
    expect(chips.map((c) => c.textContent)).toEqual([
      "Мама",
      "Тато",
      "Син",
      "Донька",
      "Робочий",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Підставити «Мама»" }),
    );
    const input = screen.getByRole("textbox", { name: "Підпис пристрою" });
    expect(input).toHaveValue("Мама");
    expect(readMyDevices()[0].label).toBeUndefined();

    await userEvent.type(input, "{Enter}");
    expect(readMyDevices()[0].label).toBe("Мама");
    expect(
      screen.queryByRole("region", { name: "Мої" }),
    ).not.toBeInTheDocument();
  });

  it("clears a label when saved empty, and Escape cancels", async () => {
    save(IPHONE_15_PRO, IPHONE_13);
    render(<MyDevicesManager shell="page" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Змінити підпис iPhone 13" }),
    );
    const input = screen.getByRole("textbox", { name: "Підпис пристрою" });
    expect(input).toHaveValue("Мама");
    await userEvent.clear(input);
    await userEvent.type(input, "Син{Escape}");
    expect(readMyDevices()[0].label).toBe("Мама");
    expect(
      screen.queryByRole("textbox", { name: "Підпис пристрою" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Змінити підпис iPhone 13" }),
    ).toHaveFocus();

    await userEvent.click(
      screen.getByRole("button", { name: "Змінити підпис iPhone 13" }),
    );
    await userEvent.clear(
      screen.getByRole("textbox", { name: "Підпис пристрою" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(readMyDevices()[0].label).toBeUndefined();
    expect(
      screen.queryByRole("region", { name: "Мама" }),
    ).not.toBeInTheDocument();
  });
});

describe("MyDevicesManager — forget", () => {
  it("forgets a device, the next one becomes active, and the toast can undo it", async () => {
    save(WATCH, IPHONE_13, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Забути iPhone 15 Pro" }),
    );
    expect(readMyDevices().map((d) => d.modelId)).toEqual(["m-13", "m-watch"]);
    expect(
      screen.getByRole("heading", { level: 1, name: "Мої пристрої · 2" }),
    ).toHaveFocus();

    expect(mockToast).toHaveBeenCalledWith(
      "iPhone 15 Pro прибрано з ваших пристроїв",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Повернути" }),
      }),
    );
    const undo = mockToast.mock.calls[0][1].action.onClick as () => void;
    act(() => undo());
    // It was the active one — undo makes it active again.
    expect(readMyDevices().map((d) => d.modelId)).toEqual([
      "m-15pro",
      "m-13",
      "m-watch",
    ]);
  });

  it("undoing a non-active device keeps the current active device", () => {
    save(WATCH, IPHONE_13, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    act(() => {
      screen.getByRole("button", { name: "Забути iPhone 13" }).click();
    });
    const undo = mockToast.mock.calls[0][1].action.onClick as () => void;
    act(() => undo());
    expect(readMyDevices()[0].modelId).toBe("m-15pro");
    expect(readMyDevices().find((d) => d.modelId === "m-13")?.label).toBe(
      "Мама",
    );
  });

  it("switches to the empty state after the last device is forgotten", async () => {
    save(IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Забути iPhone 15 Pro" }),
    );
    expect(
      screen.getByRole("heading", { name: "Ще немає збережених пристроїв" }),
    ).toBeInTheDocument();
  });
});

describe("MyDevicesManager — settings", () => {
  it("defaults to «лише сумісне» on and «для всіх» off", () => {
    save(IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    const compat = screen.getByRole("switch", {
      name: "У каталозі — лише сумісне з активним пристроєм",
    });
    const all = screen.getByRole("switch", {
      name: "Показувати товари для всіх моїх пристроїв",
    });
    expect(compat).toHaveAttribute("aria-checked", "true");
    expect(all).toHaveAttribute("aria-checked", "false");
    expect(all).toBeEnabled();
    expect(all).toHaveAccessibleDescription(
      "Зараз — лише для активного. Увімкніть, щоб бачити товари для всієї родини одразу.",
    );
  });

  it("turns «для всіх» on from anywhere on its row and names the devices in the hint", async () => {
    save(IPHONE_13, IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);

    await userEvent.click(
      screen.getByText("Показувати товари для всіх моїх пристроїв"),
    );
    const all = screen.getByRole("switch", {
      name: "Показувати товари для всіх моїх пристроїв",
    });
    expect(all).toHaveAttribute("aria-checked", "true");
    expect(readMyDevicesSettings().compatScope).toBe("all");
    expect(all).toHaveAccessibleDescription(
      "Каталог показує те, що підходить хоча б до одного з ваших пристроїв (2); на картці — до яких саме: «Підходить: iPhone 15 Pro, iPhone 13 · Мама».",
    );
  });

  it("disables «для всіх» while «лише сумісне» is off, keeping the stored scope", async () => {
    save(IPHONE_15_PRO);
    render(<MyDevicesManager shell="page" />);
    const compat = screen.getByRole("switch", {
      name: "У каталозі — лише сумісне з активним пристроєм",
    });
    const all = screen.getByRole("switch", {
      name: "Показувати товари для всіх моїх пристроїв",
    });

    await userEvent.click(all);
    await userEvent.click(compat);
    expect(compat).toHaveAttribute("aria-checked", "false");
    expect(all).toBeDisabled();
    expect(all).toHaveAttribute("aria-checked", "false");
    expect(all).toHaveAccessibleDescription(
      "Доступно, коли увімкнено «лише сумісне».",
    );
    expect(readMyDevicesSettings()).toEqual({
      compatOnly: false,
      compatScope: "all",
    });

    await userEvent.click(compat);
    expect(all).toHaveAttribute("aria-checked", "true");
  });
});

describe("MyDevicesManager — shells", () => {
  it("draws its own crumbs on the guest page", () => {
    render(<MyDevicesManager shell="page" />);
    const crumbs = screen.getByRole("navigation", {
      name: "Навігаційний ланцюжок",
    });
    expect(
      within(crumbs).getByRole("link", { name: "Головна" }),
    ).toHaveAttribute("href", "/");
    expect(within(crumbs).getByText("Мої пристрої")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("leaves navigation to the account frame", () => {
    save(IPHONE_15_PRO);
    render(<MyDevicesManager shell="account" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Мої пристрої · 1" }),
    ).toBeInTheDocument();
  });
});
