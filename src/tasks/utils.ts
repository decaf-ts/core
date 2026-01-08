import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskBackoffModel } from "./models/TaskBackoffModel";
import { BackoffStrategy, JitterStrategy } from "./constants";

export function computeBackoffMs(
  attempt: number,
  cfg: TaskBackoffModel
): number {
  const raw =
    cfg.strategy === BackoffStrategy.FIXED
      ? cfg.baseMs
      : cfg.baseMs * Math.pow(2, Math.max(0, attempt - 1));

  const capped = Math.min(raw, cfg.maxMs);

  if (cfg.jitter === JitterStrategy.FULL) {
    return Math.floor(Math.random() * capped);
  }
  return capped;
}

export function serializeError(err: any): TaskErrorModel {
  return new TaskErrorModel({
    message: err?.message ?? String(err),
    stack: err?.stack,
    code: err?.code,
    details: err?.details,
  });
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
