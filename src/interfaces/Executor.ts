export interface Executor<R> {
  execute(): Promise<R>;
}
