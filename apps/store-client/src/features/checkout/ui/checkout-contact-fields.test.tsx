import { useForm } from "react-hook-form";
import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import {
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
} from "../model/checkout-schema";
import { CheckoutContactFields } from "./checkout-contact-fields";

const g = dict.checkout.guest;

type HarnessProps = Omit<
  Parameters<typeof CheckoutContactFields>[0],
  "register" | "errors"
>;

function Harness(props: HarnessProps) {
  const { register, formState } = useForm<CheckoutFormValues>({
    defaultValues: CHECKOUT_DEFAULT_VALUES,
  });
  return (
    <CheckoutContactFields
      register={register}
      errors={formState.errors}
      {...props}
    />
  );
}

/**
 * TASK-2010 (B-12 тема 2, B-13 §0) — the guest contact block is where an
 * account is created or found. The orchestration lives in CheckoutView
 * (`checkout-view-account.test.tsx`); this is the block's own contract.
 */
describe("CheckoutContactFields — the account (TASK-2010)", () => {
  it("labels the box and describes what it does", () => {
    render(<Harness createAccount={false} onCreateAccountChange={jest.fn()} />);

    const box = screen.getByRole("checkbox", { name: g.createAccountLabel });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(g.createAccountHint);
  });

  it("reports the shopper's own tick", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<Harness createAccount={false} onCreateAccountChange={onChange} />);

    await user.click(
      screen.getByRole("checkbox", { name: g.createAccountLabel }),
    );

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("hands the typed address over on blur", async () => {
    const onEmailBlur = jest.fn();
    const user = userEvent.setup();
    render(
      <Harness onEmailBlur={onEmailBlur} onCreateAccountChange={jest.fn()} />,
    );

    await user.type(screen.getByLabelText(g.emailLabel), "olena@example.com");
    await user.tab();

    expect(onEmailBlur).toHaveBeenCalledWith("olena@example.com");
  });

  it("says why the box is ticked in a live region that is always there", () => {
    const { rerender } = render(
      <Harness createAccount={false} onCreateAccountChange={jest.fn()} />,
    );
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    rerender(
      <Harness
        createAccount
        onCreateAccountChange={jest.fn()}
        accountNotice={g.createAccountForPromo}
      />,
    );

    // The same node — a region mounted with its text is not reliably read.
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(g.createAccountForPromo);
  });

  it("an address with an account: no box, the sign-in it is handed instead", () => {
    render(
      <Harness
        hasAccount
        onCreateAccountChange={jest.fn()}
        signIn={<button type="button">sign-in form</button>}
      />,
    );

    expect(
      screen.queryByRole("checkbox", { name: g.createAccountLabel }),
    ).toBeNull();
    const block = screen.getByRole("group", { name: g.accountExistsHeading });
    expect(block).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("button", { name: "sign-in form" }),
    ).toBeInTheDocument();
    expect(screen.getByText(g.continueAsGuest)).toBeInTheDocument();
  });

  it("joins the step's form from outside it, so Enter still submits the step", () => {
    render(<Harness formId="checkout-form" />);

    expect(screen.getByLabelText(g.emailLabel)).toHaveAttribute(
      "form",
      "checkout-form",
    );
  });
});
