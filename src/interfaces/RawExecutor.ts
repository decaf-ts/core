export interface RawExecutor<Q> {
  raw<R>(rawInput: Q): Promise<R>;
}
