import { TaskStatus } from "./constants";
import { TaskErrorModel } from "./models/TaskErrorModel";

export interface TaskStateChangeRequest {
  status: TaskStatus;
  error?: TaskErrorModel;
  scheduledTo?: Date;
}

export class TaskStateChangeError extends Error {
  readonly request: TaskStateChangeRequest;

  constructor(request: TaskStateChangeRequest) {
    super(`Task requested state change: ${request.status}`);
    this.request = request;
    this.name = TaskStateChangeError.name;
    Object.setPrototypeOf(this, TaskStateChangeError.prototype);
  }
}
