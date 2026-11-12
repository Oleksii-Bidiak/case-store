/**
 * «Мої пристрої» account sync (TASK-1959). The guest list lives in
 * localStorage; once a session exists the storefront pushes it into the account
 * (merge), afterwards keeps localStorage as a mirror of the account (GET on a
 * restored session, debounced PUT of local edits) and forgets it on sign-out.
 */
import { act, render, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import * as Sentry from "@sentry/nextjs";
import { server } from "@/shared/test/msw-server";
import { setAccessToken } from "@/shared/api";
import {
  AuthContext,
  type AuthContextValue,
} from "@/entities/session/model/auth.context";
import {
  addDevice,
  readMyDevices,
  readMyDevicesOwner,
  readMyDevicesSettings,
  replaceMyDevices,
  replaceMyDevicesSettings,
  setLabel,
  updateMyDevicesSettings,
  writeMyDevicesOwner,
  type MyDevice,
} from "@/entities/my-devices";
import {
  MY_DEVICES_PUSH_DELAY_MS,
  MyDevicesSync,
} from "@/features/my-devices-sync";

// ─── fixtures ───────────────────────────────────────────────────────────────

const LOCAL: MyDevice = {
  modelId: "m-iphone",
  slug: "iphone-15-pro",
  name: "iPhone 15 Pro",
  brandName: "Apple",
  family: "iphone",
  label: "Мій",
  lastUsedAt: Date.parse("2026-11-10T10:00:00.000Z"),
};

/** What the API returns: the account's devices (one Samsung, one Apple). */
const SERVER_STATE = {
  devices: [
    {
      modelId: "m-galaxy",
      slug: "galaxy-s24",
      name: "Galaxy S24",
      brandName: "Samsung",
      brandSlug: "samsung",
      series: "Galaxy S",
      label: "Мама",
      lastUsedAt: "2026-11-11T10:00:00.000Z",
    },
    {
      modelId: "m-iphone",
      slug: "iphone-15-pro",
      name: "iPhone 15 Pro",
      brandName: "Apple",
      brandSlug: "apple",
      series: "iPhone 15",
      label: null,
      lastUsedAt: "2026-11-01T10:00:00.000Z",
    },
  ],
  settings: { compatOnly: false, compatScope: "all" },
};

const SERVER_LIST: MyDevice[] = [
  {
    modelId: "m-galaxy",
    slug: "galaxy-s24",
    name: "Galaxy S24",
    brandName: "Samsung",
    family: "galaxy",
    label: "Мама",
    lastUsedAt: Date.parse("2026-11-11T10:00:00.000Z"),
  },
  {
    modelId: "m-iphone",
    slug: "iphone-15-pro",
    name: "iPhone 15 Pro",
    brandName: "Apple",
    family: "iphone",
    lastUsedAt: Date.parse("2026-11-01T10:00:00.000Z"),
  },
];

// ─── request recording ──────────────────────────────────────────────────────

interface Recorded {
  method: string;
  path: string;
  body: unknown;
}
let calls: Recorded[];
let getStatus: number;

function useApi() {
  server.use(
    http.get("*/api/me/devices", ({ request }) => {
      calls.push({
        method: "GET",
        path: new URL(request.url).pathname,
        body: null,
      });
      return getStatus === 200
        ? HttpResponse.json({ data: SERVER_STATE })
        : HttpResponse.json({ message: "boom" }, { status: getStatus });
    }),
    http.put("*/api/me/devices", async ({ request }) => {
      const body = await request.json();
      calls.push({ method: "PUT", path: new URL(request.url).pathname, body });
      return HttpResponse.json({ data: SERVER_STATE });
    }),
    http.post("*/api/me/devices/merge", async ({ request }) => {
      const body = await request.json();
      calls.push({ method: "POST", path: new URL(request.url).pathname, body });
      return HttpResponse.json({ data: SERVER_STATE });
    }),
  );
}

const of = (method: string) => calls.filter((c) => c.method === method);

// ─── auth harness ───────────────────────────────────────────────────────────

const signedOut: AuthContextValue = {
  accessToken: null,
  userId: null,
  role: null,
  isAuthenticated: false,
  isInitializing: false,
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
};
const initializing: AuthContextValue = { ...signedOut, isInitializing: true };
const signedIn = (userId: string): AuthContextValue => ({
  ...signedOut,
  accessToken: "token",
  userId,
  role: "CUSTOMER",
  isAuthenticated: true,
});

function mount(auth: AuthContextValue) {
  const view = render(
    <AuthContext.Provider value={auth}>
      <MyDevicesSync />
    </AuthContext.Provider>,
  );
  return {
    ...view,
    setAuth(next: AuthContextValue) {
      view.rerender(
        <AuthContext.Provider value={next}>
          <MyDevicesSync />
        </AuthContext.Provider>,
      );
    },
  };
}

const sleep = (ms: number) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function resetStore() {
  replaceMyDevices([]);
  replaceMyDevicesSettings(null);
  writeMyDevicesOwner(null);
  window.localStorage.clear();
}

beforeEach(() => {
  calls = [];
  getStatus = 200;
  resetStore();
  useApi();
  setAccessToken("token");
  jest.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  setAccessToken(null);
  resetStore();
});

// ─── sign-in ────────────────────────────────────────────────────────────────

describe("guest → signed in", () => {
  it("pushes the guest list and settings into the account, then mirrors the merged state", async () => {
    replaceMyDevices([LOCAL]);
    updateMyDevicesSettings({ compatScope: "all" });
    const view = mount(signedOut);

    view.setAuth(signedIn("user-1"));

    await waitFor(() => expect(readMyDevicesOwner()).toBe("user-1"));
    expect(of("POST")).toEqual([
      {
        method: "POST",
        path: "/api/me/devices/merge",
        body: {
          devices: [
            {
              modelId: "m-iphone",
              label: "Мій",
              lastUsedAt: "2026-11-10T10:00:00.000Z",
            },
          ],
          settings: { compatOnly: true, compatScope: "all" },
        },
      },
    ]);
    expect(of("GET")).toHaveLength(0);
    expect(readMyDevices()).toEqual(SERVER_LIST);
    expect(readMyDevicesSettings()).toEqual({
      compatOnly: false,
      compatScope: "all",
    });
  });

  it("with nothing saved locally it just reads the account (no merge)", async () => {
    const view = mount(signedOut);

    view.setAuth(signedIn("user-1"));

    await waitFor(() => expect(readMyDevices()).toEqual(SERVER_LIST));
    expect(of("POST")).toHaveLength(0);
    expect(of("GET")).toHaveLength(1);
    expect(readMyDevicesOwner()).toBe("user-1");
  });

  it("does nothing while the session is still being restored", async () => {
    replaceMyDevices([LOCAL]);
    mount(initializing);

    await sleep(50);

    expect(calls).toEqual([]);
    expect(readMyDevices()).toEqual([LOCAL]);
  });
});

// ─── restored session ───────────────────────────────────────────────────────

describe("restored session", () => {
  it("whose mirror is this account: GET replaces the local copy", async () => {
    writeMyDevicesOwner("user-1");
    replaceMyDevices([LOCAL]);
    const view = mount(initializing);

    view.setAuth(signedIn("user-1"));

    await waitFor(() => expect(readMyDevices()).toEqual(SERVER_LIST));
    expect(of("GET")).toHaveLength(1);
    expect(of("POST")).toHaveLength(0);
  });

  it("whose mirror belongs to ANOTHER account: the local copy is discarded, never merged", async () => {
    writeMyDevicesOwner("user-other");
    replaceMyDevices([LOCAL]);
    const view = mount(initializing);

    view.setAuth(signedIn("user-1"));

    await waitFor(() => expect(readMyDevicesOwner()).toBe("user-1"));
    expect(of("POST")).toHaveLength(0);
    expect(of("PUT")).toHaveLength(0);
    expect(of("GET")).toHaveLength(1);
    expect(readMyDevices()).toEqual(SERVER_LIST);
  });

  it("re-reads the account when the window regains focus", async () => {
    writeMyDevicesOwner("user-1");
    mount(signedIn("user-1"));
    await waitFor(() => expect(of("GET")).toHaveLength(1));

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(of("GET")).toHaveLength(2));
  });

  it("a failed GET is reported and the local copy is kept", async () => {
    getStatus = 500;
    writeMyDevicesOwner("user-1");
    replaceMyDevices([LOCAL]);

    mount(signedIn("user-1"));

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
    expect(readMyDevices()).toEqual([LOCAL]);
  });
});

// ─── edits while signed in ──────────────────────────────────────────────────

describe("local edits while signed in", () => {
  async function signedInAndSynced() {
    writeMyDevicesOwner("user-1");
    const view = mount(signedIn("user-1"));
    await waitFor(() => expect(readMyDevices()).toEqual(SERVER_LIST));
    return view;
  }

  it("are pushed as ONE debounced PUT of the full state", async () => {
    await signedInAndSynced();

    act(() => {
      setLabel("m-galaxy", "Тато");
      updateMyDevicesSettings({ compatOnly: true });
    });
    expect(of("PUT")).toHaveLength(0);

    await waitFor(() => expect(of("PUT")).toHaveLength(1), {
      timeout: MY_DEVICES_PUSH_DELAY_MS + 2000,
    });
    expect(of("PUT")[0].body).toEqual({
      devices: [
        {
          modelId: "m-galaxy",
          label: "Тато",
          lastUsedAt: "2026-11-11T10:00:00.000Z",
        },
        {
          modelId: "m-iphone",
          label: null,
          lastUsedAt: "2026-11-01T10:00:00.000Z",
        },
      ],
      settings: { compatOnly: true, compatScope: "all" },
    });
  });

  it("applying the server state is never echoed back as a PUT", async () => {
    await signedInAndSynced();

    await sleep(MY_DEVICES_PUSH_DELAY_MS + 300);

    expect(of("PUT")).toHaveLength(0);
  });

  it("stop syncing once another tab signed out and cleared the mirror", async () => {
    await signedInAndSynced();
    const getsBefore = of("GET").length;

    // What the other tab's sign-out leaves in the shared localStorage.
    act(() => {
      replaceMyDevices([]);
      replaceMyDevicesSettings(null);
      writeMyDevicesOwner(null);
    });
    act(() => addDevice(LOCAL));
    await sleep(MY_DEVICES_PUSH_DELAY_MS + 300);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await sleep(50);

    expect(of("PUT")).toHaveLength(0);
    expect(of("GET")).toHaveLength(getsBefore);
    expect(readMyDevicesOwner()).toBeNull();
  });

  it("a guest's edits are never PUT", async () => {
    mount(signedOut);

    act(() => addDevice(LOCAL));
    await sleep(MY_DEVICES_PUSH_DELAY_MS + 300);

    expect(calls).toEqual([]);
  });
});

// ─── sign-out ───────────────────────────────────────────────────────────────

describe("signed in → signed out", () => {
  it("forgets the list, the settings and the owner in this browser", async () => {
    writeMyDevicesOwner("user-1");
    const view = mount(signedIn("user-1"));
    await waitFor(() => expect(readMyDevices()).toEqual(SERVER_LIST));

    view.setAuth(signedOut);

    await waitFor(() => expect(readMyDevices()).toEqual([]));
    expect(readMyDevicesSettings()).toEqual({
      compatOnly: true,
      compatScope: "active",
    });
    expect(readMyDevicesOwner()).toBeNull();
  });

  it("a pending edit is dropped, not PUT after the session ended", async () => {
    writeMyDevicesOwner("user-1");
    const view = mount(signedIn("user-1"));
    await waitFor(() => expect(readMyDevices()).toEqual(SERVER_LIST));

    act(() => setLabel("m-galaxy", "Тато"));
    view.setAuth(signedOut);
    await sleep(MY_DEVICES_PUSH_DELAY_MS + 300);

    expect(of("PUT")).toHaveLength(0);
  });

  it("a page load with no session but an account mirror left behind clears it", async () => {
    writeMyDevicesOwner("user-1");
    replaceMyDevices([LOCAL]);

    mount(signedOut);

    await waitFor(() => expect(readMyDevices()).toEqual([]));
    expect(readMyDevicesOwner()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("a guest's own list (no owner) survives a guest page load", async () => {
    replaceMyDevices([LOCAL]);

    mount(signedOut);
    await sleep(50);

    expect(readMyDevices()).toEqual([LOCAL]);
  });
});
