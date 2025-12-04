import { ClientBasedService, ContextualArgs, Service } from "../../src/index";
import { service } from "../../src/utils/decorators";
import { Injectables } from "@decaf-ts/injectable-decorators";

describe("services", () => {
  @service("test")
  class TestService extends ClientBasedService<object, object> {
    constructor() {
      super();
    }

    async initialize(
      ...args: ContextualArgs<any>
    ): Promise<{ config: object; client: object }> {
      const { log } = await this.logCtx(args, this.initialize);
      log.info(`Initializing ${this}...`);
      return {
        config: {},
        client: {},
      };
    }
  }

  it("Registers as a service for a class", () => {
    const services = Injectables.services();
    expect(services).toHaveProperty("test");
    expect(services.test).toBe(TestService);
  });

  it("Initializes", async () => {
    await Service.boot();
    expect(Service.get(TestService)).toBeInstanceOf(TestService);
    expect(Injectables.get(TestService)).toBeInstanceOf(TestService);
  });
});
