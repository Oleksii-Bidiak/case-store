import { pluralUk } from "./plural";
import { dict } from "./dictionary";

const forms = (n: number) => pluralUk(n, "товар", "товари", "товарів");

describe("pluralUk", () => {
  it.each([
    [1, "товар"],
    [21, "товар"],
    [101, "товар"],
    [2, "товари"],
    [3, "товари"],
    [4, "товари"],
    [22, "товари"],
    [104, "товари"],
    [0, "товарів"],
    [5, "товарів"],
    [11, "товарів"],
    [12, "товарів"],
    [13, "товарів"],
    [14, "товарів"],
    [15, "товарів"],
    [20, "товарів"],
    [111, "товарів"],
    [112, "товарів"],
  ])("%i → %s", (n, word) => {
    expect(forms(n)).toBe(word);
  });

  it("counts orders the way the history header reads them (TASK-217)", () => {
    // The mockup's «16 замовлень» was a fixed string; these are the three forms.
    expect(dict.orderHistory.count(1)).toBe("1 замовлення");
    expect(dict.orderHistory.count(3)).toBe("3 замовлення");
    expect(dict.orderHistory.count(16)).toBe("16 замовлень");
    expect(dict.orderHistory.count(11)).toBe("11 замовлень");
    expect(dict.orderHistory.count(21)).toBe("21 замовлення");
  });

  it("counts units on an order card", () => {
    expect(dict.orderHistory.itemCount(1)).toBe("1 товар");
    expect(dict.orderHistory.itemCount(2)).toBe("2 товари");
    expect(dict.orderHistory.itemCount(5)).toBe("5 товарів");
  });
});
