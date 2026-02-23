import {
  ClientBasedService,
  Repo,
  Repository,
  repository,
  Service,
  service,
} from "../../src/index";
import { model, Model, ModelArg } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { RamAdapter, RamFlavour } from "../../src/ram/index";

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

  @uses(RamFlavour)
  @model()
  class Testmodel3 extends Model {
    constructor(arg?: ModelArg<Testmodel3>) {
      super(arg);
    }
  }

  @service(Testmodel3)
  class CLientService3 extends CLientService {
    constructor() {
      super();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async initialize(...args: any[]): Promise<{ config: any; client: any }> {
      const cfg = { arg: "client3" };
      new RamAdapter();
      return super.initialize(cfg);
    }
  }

  @service()
  class ToInject extends Service {
    @service(Testmodel3)
    private service!: any;

    @service("something")
    private service2!: any;

    @repository(Testmodel3)
    private repo!: Repo<Testmodel3>;

    constructor() {
      super();
    }
  }

  @service()
  class ToInject2 extends Service {
    @service(Testmodel3)
    private service!: CLientService3;

    @service("something")
    private service2!: CLientService2;

    @repository(Testmodel3)
    private repo!: Repo<Testmodel3>;

    @service()
    private innerService!: ToInject;

    constructor() {
      super();
    }
  }

  it("properly handles and initializes services", async () => {
    await Service.boot();
    const service1 = Service.get("something") as CLientService2;
    expect(service1).toBeDefined();
    expect(service1).toBeInstanceOf(CLientService2);
    expect(client1InitMock).toHaveBeenCalledTimes(2);
    expect(client1InitMock).toHaveBeenNthCalledWith(1, { arg: "client2" });
    expect(service1.client).toBeDefined();
  });

  it("references class services properly", async () => {
    expect(client1InitMock).toHaveBeenCalledTimes(2);
    expect(client1InitMock).toHaveBeenNthCalledWith(2, { arg: "client3" });
    const service2 = Service.get(Testmodel3 as any);
    expect(service2).toBeDefined();
    expect(service2).toBeInstanceOf(CLientService3);

    const toInject1 = Service.get(ToInject);
    expect(toInject1).toBeDefined();
    expect(toInject1).toBeInstanceOf(ToInject);

    const toInject2 = Service.get(ToInject2);
    expect(toInject2).toBeDefined();
    expect(toInject2).toBeInstanceOf(ToInject2);

    expect((toInject1 as any).service).toBeDefined();
    expect((toInject1 as any).service).toBeInstanceOf(CLientService3);
    expect((toInject1 as any).service2).toBeDefined();
    expect((toInject1 as any).service2).toBeInstanceOf(CLientService2);
    expect((toInject1 as any).repo).toBeDefined();
    expect((toInject1 as any).repo).toBeInstanceOf(Repository);

    expect((toInject2 as any).service).toBeDefined();
    expect((toInject2 as any).service).toBeInstanceOf(CLientService3);
    expect((toInject2 as any).service2).toBeDefined();
    expect((toInject2 as any).service2).toBeInstanceOf(CLientService2);
    expect((toInject2 as any).innerService).toBeDefined();
    expect((toInject2 as any).innerService).toBeInstanceOf(ToInject);
    expect((toInject2 as any).repo).toBeDefined();
    expect((toInject2 as any).repo).toBeInstanceOf(Repository);
  });
});
