import { Decoration, metadata, Metadata } from "@decaf-ts/decoration";
import { TasksKey } from "./constants";

export type TaskMetadata = {
  type: string;
};

export function task(key: string) {
  function task(key: string) {
    return function innerTask(target: object) {
      const meta: TaskMetadata = {
        type: key,
      };
      Metadata.set(TasksKey, key, target);
      return metadata(TasksKey, meta)(target);
    };
  }

  return Decoration.for(TasksKey)
    .define({
      decorator: task,
      args: [key],
    })
    .apply();
}
