import { dict } from "@/shared/config";
import { auditActionLabel } from "./action-label";

describe("auditActionLabel (TASK-430)", () => {
  it("composes the entity name with the verb", () => {
    expect(auditActionLabel("order.updateStatus")).toBe(
      "Замовлення — змінено статус",
    );
    expect(auditActionLabel("product.update")).toBe("Товари — змінено");
    expect(auditActionLabel("user.setPassword")).toBe(
      "Користувачі — скинуто пароль",
    );
  });

  it("names the customer-notes journal this task added", () => {
    expect(auditActionLabel("userNote.create")).toBe(
      "Нотатки про клієнтів — створено",
    );
  });

  it("returns null for an entity it does not know", () => {
    // The caller then renders the raw key — the behaviour the column had before
    // labels existed. A new module must degrade, never disappear.
    expect(auditActionLabel("loyaltyProgram.create")).toBeNull();
  });

  it("returns null for a verb it does not know", () => {
    expect(auditActionLabel("product.rebalanceWarehouse")).toBeNull();
  });

  it.each(["", ".", "update", ".update", "product."])(
    "returns null for %p, which is not the shape the interceptor writes",
    (action) => {
      expect(auditActionLabel(action)).toBeNull();
    },
  );

  it("keeps every verb in the dictionary usable", () => {
    // Guards the composition itself: a verb accidentally written as an object or
    // left empty would silently make its actions fall back to the raw key, and the
    // store-api spec only checks that a KEY exists.
    for (const [verb, label] of Object.entries(dict.auditLog.actionVerbs)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      expect(auditActionLabel(`product.${verb}`)).toBe(
        `${dict.auditLog.entityLabels.product} — ${label}`,
      );
    }
  });
});
