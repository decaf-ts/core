import { ClientBasedService, Service, service } from "../../src/index";

describe("Service injection and setup", () => {
  const client1InitMock = jest.fn(() => ({ initialized: true }));
  class CLientService extends ClientBasedService<any, any> {
    constructor() {
      super();
    }

    async initialize(...args: any[]): Promise<{ config: any; client: any }> {
      const cfg = args[0];
      return {
        config: cfg as any,
        // @ts-expect-error meh
        client: client1InitMock(cfg),
      };
    }
  }

  @service("something")
  class CLientService2 extends CLientService {
    constructor() {
      super();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async initialize(...args: any[]): Promise<{ config: any; client: any }> {
      const cfg = { arg: "client2" };
      return super.initialize(cfg);
    }
  }

  it("properly handles and initializes services", async () => {
    await Service.boot();
    const service1 = Service.get("something") as CLientService2;
    expect(service1).toBeDefined();
    expect(service1).toBeInstanceOf(CLientService2);
    expect(client1InitMock).toHaveBeenCalledTimes(1);
    expect(client1InitMock).toHaveBeenCalledWith({ arg: "client2" });
    expect(service1.client).toBeDefined();
  });
});
