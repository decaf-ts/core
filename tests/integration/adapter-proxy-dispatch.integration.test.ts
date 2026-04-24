import { E2eConfig } from "../e2e/e2e.config";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Observer, Repository } from "../../src";
import { Product } from "../e2e/models/Product";
import { generateGtin } from "../e2e/models/gtin";

describe("Adapter proxy dispatch behavior", () => {
  it("supports observe/unObserve across equivalent adapter proxies without duplicating events", async () => {
    const adapter = await E2eConfig.adapterFactory();

    const p1 = adapter.for({ user: "u1" });
    const p2 = adapter.for({ user: "u2" });

    const calls: string[] = [];

    const o1 = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        calls.push(`o1:${args[1]}:${args[2]}`);
        return Promise.resolve();
      }
    })();

    const o2 = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        calls.push(`o2:${args[1]}:${args[2]}`);
        return Promise.resolve();
      }
    })();

    p1.observe(o1);
    p2.observe(o2);

    const repo = Repository.forModel(Product);
    const id = generateGtin();
    await repo.create(
      new Product({
        productCode: id,
        inventedName: "x",
        nameMedicinalProduct: "x",
      })
    );

    const createCalls = calls.filter((c) =>
      c.includes(`${OperationKeys.CREATE}:${id}`)
    );
    expect(createCalls).toHaveLength(2);

    expect(() => p1.unObserve(o1)).not.toThrow();
    expect(() => p2.unObserve(o2)).not.toThrow();

    calls.length = 0;
    p1.observe(o1);
    const id2 = generateGtin();
    await repo.create(
      new Product({
        productCode: id2,
        inventedName: "y",
        nameMedicinalProduct: "y",
      })
    );
    const secondCreateCalls = calls.filter((c) =>
      c.includes(`${OperationKeys.CREATE}:${id2}`)
    );
    expect(secondCreateCalls).toHaveLength(1);
    p1.unObserve(o1);

    await adapter.shutdown();
  });
});
