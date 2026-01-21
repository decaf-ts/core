import "../../src/index";
import { TaskTracker } from "../../src/tasks/TaskTracker";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskBuilder } from "../../src/tasks/builder";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskEventType, TaskStatus } from "../../src/tasks/constants";
import { TaskErrorModel } from "../../src/tasks/models/TaskErrorModel";
import { Context } from "../../src/persistence/Context";

const createTask = () =>
  new TaskBuilder({
    classification: "service-task",
    input: { value: 1 },
    maxAttempts: 1,
    attempt: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).build();

const buildStatusEvent = (
  taskId: string,
  status: TaskStatus,
  payload: any
) =>
  new TaskEventModel({
    taskId,
    classification: TaskEventType.STATUS,
    payload: {
      status,
      ...payload,
    },
  });

describe("TaskTracker hooks", () => {
  it("invokes onSucceed when the status event arrives or task is already terminal", async () => {
    const bus = new TaskEventBus();
    const task = createTask();
    const tracker = new TaskTracker(bus, task);
    const spy = jest.fn();

    tracker.onSucceed(spy);
    const evt = buildStatusEvent(task.id, TaskStatus.SUCCEEDED, { output: 42 });
    const resultPromise = tracker.resolve();
    resultPromise.catch(() => undefined);
    await tracker.refresh(evt, new Context());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining(evt),
      expect.any(Context)
    );
    await expect(resultPromise).resolves.toBe(42);

    const terminalTask = Object.assign(createTask(), {
      status: TaskStatus.SUCCEEDED,
      output: 99,
    });
    const terminalTracker = new TaskTracker(bus, terminalTask);
    const terminalPromise = terminalTracker.resolve();
    terminalPromise.catch(() => undefined);
    const terminalSpy = jest.fn();
    terminalTracker.onSucceed((evt) => terminalSpy(evt.payload));

    await expect(terminalPromise).resolves.toBe(99);
    expect(terminalSpy).toHaveBeenCalledTimes(1);
  });

  it("invokes onFail and onCancel handlers for events and terminal tasks", async () => {
    const bus = new TaskEventBus();
    const error = new TaskErrorModel({ message: "boom" });
    const failingTask = createTask();
    const failureTracker = new TaskTracker(bus, failingTask);
    const failureSpy = jest.fn();

    failureTracker.onFailure((evt) => failureSpy(evt));
    const failEvt = buildStatusEvent(failingTask.id, TaskStatus.FAILED, {
      error,
    });
    const failurePromise = failureTracker.resolve();
    failurePromise.catch(() => undefined);
    await failureTracker.refresh(failEvt, new Context());

    expect(failureSpy).toHaveBeenCalledTimes(1);
    expect(failureSpy).toHaveBeenCalledWith(
      expect.objectContaining(failEvt)
    );
    await expect(failurePromise).rejects.toMatchObject({
      message: "boom",
    });

    const terminalFailureError = new TaskErrorModel({
      message: "already failed",
    });
    const terminalFailureTask = Object.assign(createTask(), {
      status: TaskStatus.FAILED,
      error: terminalFailureError,
    });
    const terminalFailureTracker = new TaskTracker(bus, terminalFailureTask);
    const terminalFailurePromise = terminalFailureTracker.resolve();
    terminalFailurePromise.catch(() => undefined);
    const terminalFailureSpy = jest.fn();
    terminalFailureTracker.onFailure((evt) => terminalFailureSpy(evt.payload));
    await expect(terminalFailurePromise).rejects.toMatchObject({
      message: "already failed",
    });
    expect(terminalFailureSpy).toHaveBeenCalledTimes(1);
    expect(terminalFailureSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: "already failed" }),
        status: TaskStatus.FAILED,
      })
    );

    const canceledTask = Object.assign(createTask(), {
      status: TaskStatus.CANCELED,
      error: new TaskErrorModel({ message: "canceled" }),
    });
    const cancelTracker = new TaskTracker(bus, canceledTask);
    const cancelPromise = cancelTracker.resolve();
    cancelPromise.catch(() => undefined);
    const cancelSpy = jest.fn();
    cancelTracker.onCancel((evt) => cancelSpy(evt.payload));

    await expect(cancelPromise).rejects.toMatchObject({
      message: "canceled",
    });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});
