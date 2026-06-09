import { apply, Metadata, methodMetadata } from "@decaf-ts/decoration";
import { PersistenceKeys } from "../persistence/index";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  ContextualLoggedClass,
  MaybeContextualArg,
} from "./ContextualLoggedClass";

export enum ThrottleMode {
  BY_COUNT = "count",
  BY_SIZE = "size",
}

export type ThrottleSplitter<T = any> = (items: T[]) => T[][];

export interface ThrottleOptions {
  delayMs?: number;
  argIndex?: number | number[];
  breakOnSingleFailure?: boolean;
}

export function splitByCount<T>(count: number): ThrottleSplitter<T> {
  if (count <= 0)
    throw new InternalError("splitByCount: count must be greater than zero");
  return (items: T[]): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += count)
      chunks.push(items.slice(i, i + count));
    return chunks;
  };
}

export function splitBySize<T>(maxBytes: number): ThrottleSplitter<T> {
  if (maxBytes <= 0)
    throw new InternalError("splitBySize: maxBytes must be greater than zero");
  return (items: T[]): T[][] => {
    const chunks: T[][] = [];
    let current: T[] = [];
    let size = 0;
    for (const item of items) {
      const itemSize = safeByteLength(item);
      if (current.length > 0 && size + itemSize > maxBytes) {
        chunks.push(current);
        current = [item];
        size = itemSize;
      } else {
        current.push(item);
        size += itemSize;
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  };
}

export function throttle(
  value: number | ThrottleSplitter,
  options?: ThrottleOptions
): MethodDecorator;
export function throttle(
  value: number,
  mode: ThrottleMode,
  options?: ThrottleOptions
): MethodDecorator;
export function throttle(
  value: number | ThrottleSplitter,
  modeOrOptions?: ThrottleMode | ThrottleOptions,
  maybeOptions?: ThrottleOptions
): MethodDecorator {
  let splitter: ThrottleSplitter;
  let options: ThrottleOptions;

  if (typeof value === "function") {
    splitter = value;
    options = (modeOrOptions as ThrottleOptions | undefined) ?? {};
  } else {
    const mode =
      typeof modeOrOptions === "string"
        ? (modeOrOptions as ThrottleMode)
        : ThrottleMode.BY_COUNT;
    options =
      (typeof modeOrOptions === "object" && !Array.isArray(modeOrOptions)
        ? modeOrOptions
        : maybeOptions) ?? {};
    splitter =
      mode === ThrottleMode.BY_SIZE ? splitBySize(value) : splitByCount(value);
  }

  const { delayMs, argIndex = 0 } = options;

  return function throttleDecorator(
    target: object,
    propertyKey?: any,
    descriptor?: any
  ) {
    function throttleDec(target: object, propertyKey?: any, descriptor?: any) {
      descriptor.value = new Proxy(descriptor.value, {
        async apply(
          originalFn,
          thisArg: ContextualLoggedClass<any>,
          args: MaybeContextualArg<any>
        ) {
          const invocationArgs = args as any[];
          const { log, ctx } = (
            await thisArg["logCtx"](args, originalFn.name as string, true)
          ).for(throttle);

          const normalizedIndices = normalizeArgIndex(argIndex);
          if (!normalizedIndices.length)
            throw new InternalError(
              "@throttle() expects at least one argument index to throttle"
            );

          normalizedIndices.forEach((index) => {
            if (index >= invocationArgs.length)
              throw new InternalError(
                `@throttle() requires argument index ${index} but only ${invocationArgs.length} provided`
              );
            if (!Array.isArray(invocationArgs[index]))
              throw new InternalError(
                `@throttle() expects argument at index ${index} to be an array`
              );
          });

          const arrays = normalizedIndices.map(
            (idx) => invocationArgs[idx] as any[]
          );
          const total = arrays[0].length;
          if (!arrays.every((arr) => arr.length === total))
            throw new InternalError(
              "@throttle() requires all targeted arguments to have the same length"
            );

          if (total === 0) return originalFn.apply(thisArg, invocationArgs);

          const primaryChunks = splitter(arrays[0]);

          const chunkArgsList = buildChunkArgsList(
            primaryChunks,
            arrays,
            normalizedIndices,
            invocationArgs
          );

          const breakOnSingleFailure =
            options.breakOnSingleFailure ??
            (() => {
              try {
                return ctx.get("breakOnSingleFailureInBulk") as
                  | boolean
                  | undefined;
              } catch {
                return undefined;
              }
            })() ??
            true;

          const collectedResults: any[] = [];
          const errors: any[] = [];

          for (const chunkArgs of chunkArgsList) {
            try {
              const chunkResult = await originalFn.apply(thisArg, chunkArgs);
              mergeResult(chunkResult, collectedResults);
            } catch (error) {
              if (breakOnSingleFailure) throw error;
              errors.push(error);
            }
            if (delayMs)
              await new Promise((resolve) => setTimeout(resolve, delayMs));
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
      methodMetadata(
        Metadata.key(PersistenceKeys.THROTTLE, propertyKey),
        options
      ),
      throttleDec
    )(target, propertyKey, descriptor);
  };
}

function normalizeArgIndex(argIndex: number | number[]): number[] {
  const entries = (Array.isArray(argIndex) ? argIndex : [argIndex]).map(
    (idx) => {
      if (!Number.isFinite(idx) || idx < 0)
        throw new InternalError(
          "@throttle() argument indexes must be non-negative integers"
        );
      return idx;
    }
  );
  return Array.from(new Set(entries)).sort((a, b) => a - b);
}

function buildChunkArgsList(
  primaryChunks: any[][],
  arrays: any[][],
  normalizedIndices: number[],
  invocationArgs: any[]
): any[][] {
  let offset = 0;
  return primaryChunks.map((chunk) => {
    const chunkLen = chunk.length;
    const args = invocationArgs.map((arg, idx) => {
      const targetIdx = normalizedIndices.indexOf(idx);
      if (targetIdx === -1) return arg;
      return targetIdx === 0
        ? chunk
        : arrays[targetIdx].slice(offset, offset + chunkLen);
    });
    offset += chunkLen;
    return args;
  });
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
