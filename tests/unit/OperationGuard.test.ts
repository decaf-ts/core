import {
  Adapter,
  BaseModel,
  column,
  ModelService,
  pk,
  RamAdapter,
  RamFlavour,
  read,
  table,
} from "../../src";
import { BlockOperations, OperationKeys } from "@decaf-ts/db-decorators";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const adapter = new RamAdapter();
const DB_FAVLOUR = RamFlavour;

describe("OperationGuard decorators", () => {
  describe("when model blocks only CREATE", () => {
    @uses(DB_FAVLOUR)
    @table("block_product_create")
    @model()
    @BlockOperations([OperationKeys.CREATE])
    class BlockedProduct extends BaseModel {
      @pk()
      productCode!: string;

      @column()
      @required()
      name!: string;

      constructor(args?: ModelArg<BlockedProduct>) {
        super(args);
      }
    }

    const service = ModelService.forModel(BlockedProduct);

    it("should throw on create when CREATE is blocked by @BlockOperations", async () => {
      expect(() => service.create({ name: "test" } as any)).toThrow(
        `Operation "create" is blocked by @BlockOperations for ${BlockedProduct.name}`
      );
    });

    it("should pass through read-decorated method query", async () => {
      await expect(service.query("byName", "test")).rejects.toThrow(
        'Method "byName" is not implemented'
      );
    });
  });

  describe("when model blocks ALL operations", () => {
    @uses(DB_FAVLOUR)
    @table("fully_blocked_product")
    @model()
    @BlockOperations([
      OperationKeys.CREATE,
      OperationKeys.READ,
      OperationKeys.UPDATE,
      OperationKeys.DELETE,
    ])
    class FullyBlockedProduct extends BaseModel {
      @pk()
      productCode!: string;

      @column()
      @required()
      name!: string;

      constructor(args?: ModelArg<FullyBlockedProduct>) {
        super(args);
      }
    }

    class FullyBlockedExtraReadService extends ModelService<FullyBlockedProduct> {
      constructor() {
        super(FullyBlockedProduct);
      }

      @read()
      async extraRead(): Promise<null> {
        throw new Error("Should not be reached");
      }
    }

    const service = ModelService.forModel(FullyBlockedProduct);

    it("should throw on create when CREATE is blocked", async () => {
      expect(() => service.create({ name: "t" } as any)).toThrow(
        `Operation "create" is blocked by @BlockOperations for ${FullyBlockedProduct.name}.`
      );
    });

    it("should throw on read when READ is blocked", async () => {
      expect(() => service.read("id-1")).toThrow(
        `Operation "read" is blocked by @BlockOperations for ${FullyBlockedProduct.name}.`
      );
    });

    it("should throw on update when UPDATE is blocked", async () => {
      expect(() => service.update("id-1", { name: "t" } as any)).toThrow(
        `Operation "update" is blocked by @BlockOperations for ${FullyBlockedProduct.name}.`
      );
    });

    it("should throw on delete (remove) when DELETE is blocked", async () => {
      expect(() => service.delete("id-1")).toThrow(
        `Operation "delete" is blocked by @BlockOperations for ${FullyBlockedProduct.name}.`
      );
    });

    it("should also throw on extra @read()-decorated service method", async () => {
      const extraMethodService = new FullyBlockedExtraReadService();
      expect(() => extraMethodService.extraRead()).toThrow(
        `Operation "read" is blocked by @BlockOperations for ${FullyBlockedProduct.name}.`
      );
    });

    it("should throw on read-decorated BaseService.query", async () => {
      expect(() => service.query("x")).toThrow(
        `Operation "read" is blocked by @BlockOperations for ${FullyBlockedProduct.name}.`
      );
    });
  });

  describe("when model blocks SOME operations", () => {
    @uses(DB_FAVLOUR)
    @table("part_blocked_product")
    @model()
    @BlockOperations([OperationKeys.CREATE, OperationKeys.UPDATE])
    class PartiallyBlockedProduct extends BaseModel {
      @pk()
      productCode!: string;

      @column()
      @required()
      name!: string;

      constructor(args?: ModelArg<PartiallyBlockedProduct>) {
        super(args);
      }
    }

    class PartiallyBlockedExtraReadService extends ModelService<PartiallyBlockedProduct> {
      constructor() {
        super(PartiallyBlockedProduct);
      }

      @read()
      async extraReadAllowed(): Promise<null> {
        throw new Error("Should be reached and allow read");
      }
    }

    it("should throw on create when CREATE is blocked", async () => {
      const service = ModelService.forModel(PartiallyBlockedProduct);
      expect(() => service.create({ name: "t" } as any)).toThrow(
        `Operation "create" is blocked by @BlockOperations for ${PartiallyBlockedProduct.name}.`
      );
    });

    it("should throw on update when UPDATE is blocked", async () => {
      const service = ModelService.forModel(PartiallyBlockedProduct);
      expect(() => service.update("id-1", { name: "t" } as any)).toThrow(
        `Operation "update" is blocked by @BlockOperations for ${PartiallyBlockedProduct.name}`
      );
    });

    it("should pass through read-decorated method query", async () => {
      const service = ModelService.forModel(PartiallyBlockedProduct);
      await expect(service.query("x")).rejects.toThrow(
        'Method "x" is not implemented'
      );
    });

    it("should pass through extra @read()-decorated method and reach method body", async () => {
      const service = new PartiallyBlockedExtraReadService();
      await expect(service.extraReadAllowed()).rejects.toThrow(
        "Should be reached and allow read"
      );
    });
  });

  describe("when model has NO @BlockOperations guards should allow everything", () => {
    @uses(DB_FAVLOUR)
    @table("open_product")
    @model()
    class OpenProduct extends BaseModel {
      @pk()
      productCode!: string;

      @column()
      @required()
      name!: string;

      constructor(args?: ModelArg<OpenProduct>) {
        super(args);
      }
    }

    class OpenProductExtraReadService extends ModelService<OpenProduct> {
      constructor() {
        super(OpenProduct);
      }

      @read()
      async extraRead(): Promise<null> {
        throw new Error("Should allow read");
      }
    }

    it("should pass through read-decorated method query", async () => {
      const service = ModelService.forModel(OpenProduct);
      await expect(service.query("x")).rejects.toThrow(
        `Method "x" is not implemented`
      );
    });

    it("should allow extra @read()-decorated method and reach its body", async () => {
      const service = new OpenProductExtraReadService();
      await expect(service.extraRead()).rejects.toThrow("Should allow read");
    });
  });
});
