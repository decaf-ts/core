import { Observer } from "./Observer";

export interface Observable {
  observe(observer: Observer, ...args: any[]): void;

  unObserve(observer: Observer, ...args: any[]): void;

  updateObservers(...args: any[]): Promise<void>;
}
