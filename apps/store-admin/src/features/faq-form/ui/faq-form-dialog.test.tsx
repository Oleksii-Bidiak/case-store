/**
 * The FAQ form as a dialog over the list (FaqProposal ЧП4–ЧП8, TASK-1075 —
 * owner decision 2026-10-01: short forms open in a dialog, like blog
 * categories).
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { FaqItemEntity } from "@/entities/faq";
import { FaqFormDialog } from "./faq-form-dialog";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const f = dict.faqForm;

const ITEM: FaqItemEntity = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  question: "Скільки коштує доставка?",
  answer: "Безкоштовно від 1 000 ₴.",
  sortOrder: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as FaqItemEntity;

function renderDialog(
  props: Partial<React.ComponentProps<typeof FaqFormDialog>> = {},
) {
  const onOpenChange = jest.fn();
  renderWithProviders(
    <FaqFormDialog open onOpenChange={onOpenChange} {...props} />,
  );
  return { onOpenChange };
}

const questionField = () => screen.getByRole("textbox", { name: f.question });
const answerField = () => screen.getByRole("textbox", { name: f.answer });

describe("FaqFormDialog — create (ЧП5)", () => {
  it("is titled «Нове запитання» and adds through «Додати запитання»", async () => {
    let body: unknown = null;
    server.use(
      http.post("*/api/admin/faq", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: ITEM }, { status: 201 });
      }),
    );
    const { onOpenChange } = renderDialog();

    const dialog = screen.getByRole("dialog", {
      name: dict.faq.createHeading,
    });
    await userEvent.type(questionField(), "Як оплатити?");
    await userEvent.type(answerField(), "Карткою.");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.faq.createSubmit }),
    );

    await waitFor(() =>
      expect(body).toEqual({
        question: "Як оплатити?",
        answer: "Карткою.",
        isActive: true,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("names what is missing above the form and under each field", async () => {
    renderDialog();

    await userEvent.click(
      screen.getByRole("button", { name: dict.faq.createSubmit }),
    );

    expect(await screen.findByText(f.formAlert)).toBeInTheDocument();
    expect(questionField()).toHaveAttribute("aria-invalid", "true");
    expect(answerField()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(f.errors.questionRequired)).toBeInTheDocument();
    expect(screen.getByText(f.errors.answerRequired)).toBeInTheDocument();
  });

  it("counts characters against the API's limits", async () => {
    renderDialog();

    await userEvent.type(questionField(), "Як?");
    expect(screen.getByText(f.counter(3, 500))).toBeInTheDocument();
    expect(screen.getByText(f.counter(0, 5000))).toBeInTheDocument();
  });

  it("shows the item on the site by default through a Switch", () => {
    renderDialog();

    expect(screen.getByRole("switch", { name: f.isActive })).toBeChecked();
    expect(screen.getByText(f.isActiveHint)).toBeInTheDocument();
  });
});

describe("FaqFormDialog — edit (ЧП4)", () => {
  it("prefills, previews the /info item and saves through PUT", async () => {
    let body: unknown = null;
    server.use(
      http.put(`*/api/admin/faq/${ITEM.id}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: ITEM });
      }),
    );
    const { onOpenChange } = renderDialog({ item: ITEM });

    const dialog = screen.getByRole("dialog", { name: dict.faq.editHeading });
    await waitFor(() => expect(questionField()).toHaveValue(ITEM.question));

    const preview = within(dialog).getByRole("region", { name: f.preview });
    expect(within(preview).getByText(ITEM.question)).toBeInTheDocument();
    expect(within(preview).getByText(ITEM.answer)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: f.isActive }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: f.submit }),
    );

    await waitFor(() =>
      expect(body).toEqual({
        question: ITEM.question,
        answer: ITEM.answer,
        isActive: false,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("«Скасувати» closes without saving", async () => {
    let calls = 0;
    server.use(
      http.put(`*/api/admin/faq/${ITEM.id}`, () => {
        calls += 1;
        return HttpResponse.json({ data: ITEM });
      }),
    );
    const { onOpenChange } = renderDialog({ item: ITEM });

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.cancel }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(calls).toBe(0);
  });

  it("is read-only without faq:write — fields disabled, only «Закрити»", async () => {
    renderDialog({ item: ITEM, readOnly: true });

    await waitFor(() => expect(questionField()).toHaveValue(ITEM.question));
    expect(questionField()).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
  });
});
