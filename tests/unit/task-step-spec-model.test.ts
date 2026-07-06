import "../../src/index";
import { CompositeTaskBuilder } from "../../src/tasks/builder";
import { TaskStepSpecModel } from "../../src/tasks/models/TaskStepSpecModel";

describe("TaskStepSpecModel canFail", () => {
  it("defaults canFail to false and preserves explicit values", () => {
    const defaultStep = new TaskStepSpecModel({
      classification: "step-default",
    });
    expect(defaultStep.canFail).toBe(false);

    const explicitStep = new TaskStepSpecModel({
      classification: "step-explicit",
      canFail: true,
    });
    expect(explicitStep.canFail).toBe(true);
  });

  it("can be configured through the composite step builder", () => {
    const composite = new CompositeTaskBuilder({
      classification: "builder-test",
    })
      .addStep("step-builder")
      .setCanFail(true)
      .build();

    expect(composite.steps?.[0]?.canFail).toBe(true);
  });

  it("supports canFail in the nested step-builder addStep overload", () => {
    const composite = new CompositeTaskBuilder({
      classification: "builder-test-nested",
    })
      .addStep("step-root")
      .addStep("step-nested", { value: 3 }, true)
      .build();

    expect(composite.steps).toHaveLength(2);
    expect(composite.steps?.[1]?.input).toEqual({ value: 3 });
    expect(composite.steps?.[1]?.canFail).toBe(true);
  });

  it("accepts canFail in the inline step construction overloads", () => {
    const inputOnly = new CompositeTaskBuilder({
      classification: "builder-test-input",
    })
      .addStep("step-input", { value: 1 }, true)
      .build();

    expect(inputOnly.steps?.[0]?.input).toEqual({ value: 1 });
    expect(inputOnly.steps?.[0]?.canFail).toBe(true);

    const named = new CompositeTaskBuilder({
      classification: "builder-test-named",
    })
      .addStep("step-named", "named-step", { value: 2 }, true)
      .build();

    expect(named.steps?.[0]?.name).toBe("named-step");
    expect(named.steps?.[0]?.input).toEqual({ value: 2 });
    expect(named.steps?.[0]?.canFail).toBe(true);
  });
});
