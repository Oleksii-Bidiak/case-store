import { submitPaymentHandoff } from "./payment-handoff";
import {
  forgetPaymentAttempt,
  readPaymentAttempt,
  rememberPaymentAttempt,
  PAYMENT_ATTEMPT_TTL_MS,
} from "./payment-attempt";

/**
 * `.tsx` on purpose, despite holding no JSX: the Jest config routes `*.test.ts`
 * to the node project and `*.test.tsx` to jsdom. Both modules under test touch
 * `document` / `sessionStorage`, so they need the browser environment.
 */
describe("submitPaymentHandoff (TASK-330-B)", () => {
  let submit: jest.SpyInstance;

  beforeEach(() => {
    // jsdom does not implement real navigation; spying also keeps the test from
    // emitting a "Not implemented" console error.
    submit = jest
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    submit.mockRestore();
    document.body.innerHTML = "";
  });

  it("POSTs to the URL the server returned, with the fields it returned", () => {
    const form = submitPaymentHandoff({
      paymentId: "payment-1",
      url: "https://provider.example/checkout",
      method: "POST",
      fields: { data: "BASE64", signature: "SIG" },
    });

    expect(form.method).toBe("post");
    expect(form.action).toBe("https://provider.example/checkout");
    expect(submit).toHaveBeenCalledTimes(1);

    const inputs = Array.from(form.querySelectorAll("input"));
    expect(inputs.map((i) => [i.name, i.value])).toEqual([
      ["data", "BASE64"],
      ["signature", "SIG"],
    ]);
    expect(inputs.every((i) => i.type === "hidden")).toBe(true);
  });

  /**
   * The point of the whole design: the storefront must not know the provider's
   * field vocabulary. Whatever keys the server sends are what gets submitted, so
   * a provider migration — or a second provider — is a backend-only change.
   */
  it("carries arbitrary field names through without interpreting them", () => {
    const form = submitPaymentHandoff({
      paymentId: "payment-2",
      url: "https://other-provider.example/pay",
      method: "POST",
      fields: { merchantAccount: "acct", orderReference: "ref", token: "t" },
    });

    expect(
      Array.from(form.querySelectorAll("input")).map((i) => i.name),
    ).toEqual(["merchantAccount", "orderReference", "token"]);
  });

  it("honours a GET handoff without rewriting it to POST", () => {
    const form = submitPaymentHandoff({
      paymentId: "payment-3",
      url: "https://provider.example/redirect",
      method: "GET",
      fields: {},
    });

    expect(form.method).toBe("get");
    expect(form.querySelectorAll("input")).toHaveLength(0);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("keeps the transient form out of the accessibility tree", () => {
    const form = submitPaymentHandoff({
      paymentId: "payment-4",
      url: "https://provider.example/checkout",
      method: "POST",
      fields: { data: "x" },
    });

    expect(form.hidden).toBe(true);
    expect(document.body.contains(form)).toBe(true);
  });
});

describe("payment attempt memory (TASK-330-B)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("remembers and reads back an attempt for the order it belongs to", () => {
    rememberPaymentAttempt("order-1", "payment-1", 1_000);

    expect(readPaymentAttempt("order-1", 2_000)).toEqual({
      paymentId: "payment-1",
      startedAt: 1_000,
    });
    // Scoped per order — another order must not inherit it.
    expect(readPaymentAttempt("order-2", 2_000)).toBeNull();
  });

  it("treats an expired attempt as no attempt", () => {
    rememberPaymentAttempt("order-1", "payment-1", 1_000);

    expect(
      readPaymentAttempt("order-1", 1_000 + PAYMENT_ATTEMPT_TTL_MS + 1),
    ).toBeNull();
  });

  it("treats a corrupted entry as no attempt rather than throwing", () => {
    // It is session storage: anything can be in there. The quiet branch is the
    // safe one, because this value only ever chooses wording.
    sessionStorage.setItem("checkout:payment-attempt:order-1", "not json");
    expect(readPaymentAttempt("order-1")).toBeNull();

    sessionStorage.setItem(
      "checkout:payment-attempt:order-1",
      JSON.stringify({ paymentId: 42 }),
    );
    expect(readPaymentAttempt("order-1")).toBeNull();
  });

  it("forgets an attempt once the payment settles", () => {
    rememberPaymentAttempt("order-1", "payment-1");
    forgetPaymentAttempt("order-1");

    expect(readPaymentAttempt("order-1")).toBeNull();
  });
});
