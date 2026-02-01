import { apply, Metadata, methodMetadata } from "@decaf-ts/decoration";
import { PersistenceKeys } from "../persistence/index";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  ContextualLoggedClass,
  MaybeContextualArg,
} from "./ContextualLoggedClass";

export type BseThrottlingConfig = { delayMs?: number };

export type ThrottlingConfig = ({ count: number } | { bufferSize: number }) &
  BseThrottlingConfig;

export function throttle(
  cfg: ThrottlingConfig | ((...args: any[]) => ThrottlingConfig) = { count: 1 },
  argIndex: number | number[] = 0
) {
  return function throttle(
    target: object,
    propertyKey?: any,
    descriptor?: any
  ) {
    function throttleDec(target: object, propertyKey?: any, descriptor?: any) {
      descriptor.value = new Proxy(descriptor.value, {
        async apply(
          target,
          thisArg: ContextualLoggedClass<any>,
          args: MaybeContextualArg<any>
        ) {
          const invocationArgs = args as any[];
          const effectiveCfg = (() => {
            try {
              return typeof cfg === "function"
                ? cfg(...invocationArgs)
                : cfg;
            } catch (e: unknown) {
              throw new InternalError(
                `Failed to obtain throttling configuration from handler: ${e}`
              );
            }
          })();

          const { log, ctx } = (
            await thisArg["logCtx"](args, PersistenceKeys.THROTTLE, true)
          ).for(throttle);
          const normalizedIndices = normalizeArgIndex(argIndex);
          if (!normalizedIndices.length) {
            throw new InternalError(
              "@throttling() expects at least one argument index to throttle"
            );
          }
          normalizedIndices.forEach((index) => {
            if (index >= invocationArgs.length)
              throw new InternalError(
                `@throttling() requires argument index ${index} but only ${invocationArgs.length} provided`
              );
            if (!Array.isArray(invocationArgs[index]))
              throw new InternalError(
                `@throttling() expects argument at index ${index} to be an array`
              );
          });

          const arrays = normalizedIndices.map(
            (idx) => invocationArgs[idx] as any[]
          );
          const total = arrays[0].length;
          if (!arrays.every((arr) => arr.length === total)) {
            throw new InternalError(
              "@throttling() requires all targeted arguments to have the same length"
            );
          }

          if (total === 0) {
            return target.apply(thisArg, invocationArgs);
          }

          const chunkBounds = buildChunkBounds(total, arrays, effectiveCfg);
          const chunkArgsList = chunkBounds.map(({ start, end }) =>
            invocationArgs.map((arg, idx) => {
              const targetIdx = normalizedIndices.indexOf(idx);
              if (targetIdx === -1) return arg;
              return arrays[targetIdx].slice(start, end);
            })
          );

          const breakOnSingleFailure =
            ctx.get("breakOnSingleFailureInBulk") ?? true;
          const collectedResults: any[] = [];
          const errors: any[] = [];

          for (const chunkArgs of chunkArgsList) {
            try {
              const chunkResult = await target.apply(thisArg, chunkArgs);
              mergeResult(chunkResult, collectedResults);
            } catch (error) {
              if (breakOnSingleFailure) throw error;
              errors.push(error);
            }
            if (effectiveCfg.delayMs) {
              await new Promise((resolve) => setTimeout(resolve, effectiveCfg.delayMs));
            }
          }

          if (errors.length) {
            log.warn(
              `${String(propertyKey)} throttled execution continued with ${errors.length} failure(s)`
            );
            const aggregate = new AggregateError(
              errors,
              `Throttled ${String(propertyKey)} failed for ${errors.length} chunk(s)`
            );
            (aggregate as any).results = collectedResults;
            throw aggregate;
          }

          return collectedResults;
        },
      });
    }

    return apply(
      methodMetadata(Metadata.key(PersistenceKeys.THROTTLE, propertyKey), cfg),
      throttleDec
    )(target, propertyKey, descriptor);
  };
}

function normalizeArgIndex(argIndex: number | number[]): number[] {
  const entries = (Array.isArray(argIndex) ? argIndex : [argIndex]).map(
    (idx) => {
      if (!Number.isFinite(idx) || idx < 0)
        throw new InternalError(
          "@throttling() argument indexes must be non-negative integers"
        );
      return idx;
    }
  );
  return Array.from(new Set(entries)).sort((a, b) => a - b);
}

function buildChunkBounds(
  total: number,
  arrays: any[][],
  cfg: ThrottlingConfig
): { start: number; end: number }[] {
  if ("count" in cfg) {
    if (cfg.count <= 0)
      throw new InternalError(
        "@throttling() configuration 'count' must be greater than zero"
      );
    const spans: { start: number; end: number }[] = [];
    for (let start = 0; start < total; start += cfg.count) {
      spans.push({
        start,
        end: Math.min(total, start + cfg.count),
      });
    }
    return spans;
  }

  if ("bufferSize" in cfg) {
    if (cfg.bufferSize <= 0)
      throw new InternalError(
        "@throttling() configuration 'bufferSize' must be greater than zero"
      );
    const spans: { start: number; end: number }[] = [];
    let start = 0;
    let size = 0;
    for (let idx = 0; idx < total; idx++) {
      const entrySize = estimateEntrySize(arrays, idx);
      if (size > 0 && size + entrySize > cfg.bufferSize) {
        spans.push({ start, end: idx });
        start = idx;
        size = entrySize;
      } else {
        size += entrySize;
      }
    }
    if (start < total || !spans.length) {
      spans.push({ start, end: total });
    }
    return spans;
  }

  return [{ start: 0, end: total }];
}

function estimateEntrySize(arrays: any[][], index: number): number {
  return arrays.reduce((acc, array) => acc + safeByteLength(array[index]), 0);
}

function safeByteLength(value: any): number {
  if (value === null || typeof value === "undefined") return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function mergeResult(result: unknown, collector: any[]) {
  if (Array.isArray(result)) {
    collector.push(...result);
  } else if (typeof result !== "undefined") {
    collector.push(result);
  }
}
