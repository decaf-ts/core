import { padEnd } from "@decaf-ts/logging";

export interface Generator<OUT extends string | number = string> {
  generate(prev?: OUT): OUT;
}

export class UUID implements Generator {
  private static _instance: UUID;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generate(prev?: string): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0,
          v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  static get instance(): UUID {
    if (!UUID._instance) UUID._instance = new UUID();
    return UUID._instance;
  }
}

export class Serial implements Generator {
  private static _instance: Serial;

  private count = 14;

  generate(prev?: string): string {
    prev = ((prev ? parseInt(prev as string) : 0) || 0) as unknown as string;
    return ((prev as unknown as number) + 1)
      .toString()
      .padStart(this.count, "0");
  }

  static get instance(): Serial {
    if (!Serial._instance) Serial._instance = new Serial();
    return Serial._instance;
  }
}
