import "reflect-metadata";
import { Service, service } from "../../src/index";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { InjectablesRegistry } from "../../src/repository/injectables";
import {
  Model,
  model,
  type ModelArg,
} from "@decaf-ts/decorator-validation";

describe("service decorator injection variants", () => {
  beforeEach(() => {
    Injectables.setRegistry(new InjectablesRegistry());
  });

  afterAll(() => {
    Injectables.setRegistry(new InjectablesRegistry());
  });

  it("injects a @service() class using the class constructor as key", () => {
    @service()
    class ClassScopedService extends Service {
      constructor() {
        super();
      }
    }

    class ClassScopedConsumer {
      @service()
      service!: ClassScopedService;
    }

    const consumer = new ClassScopedConsumer();
    const resolved = Service.get(ClassScopedService);

    expect(consumer.service).toBeInstanceOf(ClassScopedService);
    expect(resolved).toBeInstanceOf(ClassScopedService);
    expect(consumer.service).toBe(resolved);
  });

  it("injects a @service(ModelClass) class using the model as key", () => {
    @model()
    class InjectionModel extends Model {
      constructor(arg?: ModelArg<InjectionModel>) {
        super(arg);
      }
    }

    @service(InjectionModel)
    class ModelScopedService extends Service {
      constructor() {
        super();
      }
    }

    class ModelScopedConsumer {
      @service(InjectionModel)
      service!: ModelScopedService;
    }

    const consumer = new ModelScopedConsumer();
    const resolved = Service.get(InjectionModel);

    expect(consumer.service).toBeInstanceOf(ModelScopedService);
    expect(resolved).toBeInstanceOf(ModelScopedService);
    expect(consumer.service).toBe(resolved);
  });

  it("injects a @service(\"string\") class using the alias as key", () => {
    @service("string-keyed-service")
    class StringScopedService extends Service {
      constructor() {
        super();
      }
    }

    class StringScopedConsumer {
      @service("string-keyed-service")
      service!: StringScopedService;
    }

    const consumer = new StringScopedConsumer();
    const resolved = Service.get("string-keyed-service");

    expect(consumer.service).toBeInstanceOf(StringScopedService);
    expect(resolved).toBeInstanceOf(StringScopedService);
    expect(consumer.service).toBe(resolved);
  });
});
