import { act, renderHook } from "@testing-library/react";
import { useEditLockToken } from "./use-edit-lock-token";

type Props = { isDirty: boolean; current: string };

function setup(initial: Props) {
  return renderHook(
    ({ isDirty, current }: Props) => useEditLockToken(isDirty, current),
    { initialProps: initial },
  );
}

describe("useEditLockToken (TASK-629)", () => {
  it("follows the entity while the form is clean", () => {
    const { result, rerender } = setup({ isDirty: false, current: "v1" });
    expect(result.current.token).toBe("v1");

    rerender({ isDirty: false, current: "v2" });
    expect(result.current.token).toBe("v2");
  });

  it("holds the version the form became dirty on while a refetch moves on", () => {
    const { result, rerender } = setup({ isDirty: false, current: "v1" });

    rerender({ isDirty: true, current: "v1" });
    expect(result.current.token).toBe("v1");

    rerender({ isDirty: true, current: "v2" });
    expect(result.current.token).toBe("v1");
  });

  it("lets go once the form is clean again, and captures anew on the next edit", () => {
    const { result, rerender } = setup({ isDirty: true, current: "v1" });
    rerender({ isDirty: true, current: "v2" });
    expect(result.current.token).toBe("v1");

    rerender({ isDirty: false, current: "v2" });
    expect(result.current.token).toBe("v2");

    rerender({ isDirty: true, current: "v2" });
    rerender({ isDirty: true, current: "v3" });
    expect(result.current.token).toBe("v2");
  });

  it("rebases onto a version the operator was told about", () => {
    const { result, rerender } = setup({ isDirty: true, current: "v1" });
    rerender({ isDirty: true, current: "v2" });

    act(() => result.current.rebase("v2"));
    expect(result.current.token).toBe("v2");

    rerender({ isDirty: true, current: "v3" });
    expect(result.current.token).toBe("v2");
  });
});
