import { Observer } from "./Observer";

export interface Observable {
  observe(observer: Observer): void;

  unObserve(observer: Observer): void;

  updateObservers(...args: any[]): Promise<void>;
}
