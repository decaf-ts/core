import { final } from "../../src/utils/decorators";

describe("utils/decorators final", () => {
  it("throws if applied without descriptor (non-method)", () => {
    expect(() => (final() as any)({}, "prop" as any)).toThrow(
      /final decorator can only be used on methods/
    );
  });

  it("marks method as non-configurable", () => {
    class X {
      foo() {
        return 1;
      }
    }
    const proto = X.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "foo")!;
    const ret = final()(proto, "foo", descriptor);
    expect(ret).toBe(descriptor);
    expect(ret.configurable).toBe(false);
    // ensure method still callable
    expect(new X().foo()).toBe(1);
  });
});
