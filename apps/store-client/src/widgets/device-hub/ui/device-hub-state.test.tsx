/**
 * The hub's device-state island (TASK-1954): kicker variants, the one action,
 * and «Інша модель» following the picked model to its own hub.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import {
  addDevice,
  clearMyDevices,
  closeDevicePicker,
  getDevicePickerState,
  readMyDevices,
} from "@/entities/my-devices";
import {
  DeviceHubActions,
  DeviceHubKicker,
  getHubDeviceState,
  hubKickerText,
  type HubStateModel,
} from "./device-hub-state";

const model: HubStateModel = {
  id: "m-15pro",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  brandSlug: "apple",
  series: "iPhone 15",
};

const save = (id: string, slug: string, label?: string) =>
  addDevice({
    modelId: id,
    slug,
    name: slug,
    brandName: "Apple",
    family: "iphone",
    ...(label ? { label } : {}),
  });

beforeEach(() => {
  push.mockReset();
  act(() => {
    clearMyDevices();
    closeDevicePicker();
  });
});

describe("hub device state", () => {
  it("is active for the first device, saved for any other, none otherwise", () => {
    act(() => {
      save("m-15pro", "iphone-15-pro");
      save("m-13", "iphone-13");
    });
    const devices = readMyDevices();
    expect(getHubDeviceState(devices, "m-13").kind).toBe("active");
    expect(getHubDeviceState(devices, "m-15pro").kind).toBe("saved");
    expect(getHubDeviceState(devices, "m-x").kind).toBe("none");
  });

  it("phrases the kicker per state, with the shopper's label", () => {
    const device = {
      modelId: "m-15pro",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      family: "iphone" as const,
      lastUsedAt: 1,
    };
    expect(hubKickerText({ kind: "none" }, model)).toBe("Apple · iPhone 15");
    expect(hubKickerText({ kind: "active", device }, model)).toBe(
      "Apple · ваш активний пристрій",
    );
    expect(
      hubKickerText(
        { kind: "active", device: { ...device, label: "Мама" } },
        model,
      ),
    ).toBe("Ваш активний · Мама");
    expect(
      hubKickerText(
        { kind: "saved", device: { ...device, label: "Мама" } },
        model,
      ),
    ).toBe("Apple · збережено у ваших · Мама");
  });

  it("adds the model and turns the button into the focused active pill", async () => {
    const user = userEvent.setup();
    render(
      <>
        <p>
          <DeviceHubKicker model={model} />
        </p>
        <DeviceHubActions model={model} />
      </>,
    );

    expect(screen.getByText("Apple · iPhone 15")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Додати до моїх пристроїв" }),
    );

    expect(readMyDevices()[0].modelId).toBe("m-15pro");
    const pill = screen.getByText("Ваш активний пристрій");
    expect(pill).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Додати до моїх пристроїв" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Apple · ваш активний пристрій"),
    ).toBeInTheDocument();
  });

  it("offers «Показувати для нього» for a saved, inactive model", async () => {
    const user = userEvent.setup();
    act(() => {
      save("m-15pro", "iphone-15-pro");
      save("m-13", "iphone-13");
    });
    render(<DeviceHubActions model={model} />);

    await user.click(
      screen.getByRole("button", { name: "Показувати для нього" }),
    );
    expect(readMyDevices()[0].modelId).toBe("m-15pro");
    expect(screen.getByText("Ваш активний пристрій")).toBeInTheDocument();
  });

  it("follows a model picked through «Інша модель» to its hub", async () => {
    const user = userEvent.setup();
    render(<DeviceHubActions model={model} />);

    await user.click(screen.getByRole("button", { name: "Інша модель" }));
    expect(getDevicePickerState().open).toBe(true);

    // What the picker does on a pick: save + activate, then close.
    act(() => {
      save("m-s24", "galaxy-s24");
      closeDevicePicker();
    });

    expect(push).toHaveBeenCalledWith("/devices/galaxy-s24");
  });

  it("does not navigate when the picker closes without a pick", async () => {
    const user = userEvent.setup();
    render(<DeviceHubActions model={model} />);

    await user.click(screen.getByRole("button", { name: "Інша модель" }));
    act(() => closeDevicePicker());
    // A later change elsewhere (another entry point) is not this request.
    act(() => save("m-s24", "galaxy-s24"));

    expect(push).not.toHaveBeenCalled();
  });
});
