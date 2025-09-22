import { RamAdapter, RamRepository } from "../../src/ram";
import { Adapter, Repository, BaseModel, pk, PersistenceKeys } from "../../src";
import {
  Context,
  GroupSort,
  IRepository,
  NotFoundError,
  onCreate,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import {
  maxlength,
  minlength,
  model,
  Model,
  required,
} from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";

export const globals = {
  counter: 0,
};
export function groupSortMetadata(data: any, groupsort: GroupSort) {
  function saveGroupSort<
    M extends Model,
    R extends IRepository<M, F, C>,
    V = object,
    F extends RepositoryFlags = RepositoryFlags,
    C extends Context<F> = Context<F>,
  >(this: R, context: C, metadata: V[], keys: (keyof M)[], model: M) {
    keys.forEach((k, i) => {
      // Object.defineProperty(model, `${String(k)}_meta`, {
      //   value: metadata,
      //   writable: false,
      //   enumerable: false,
      // });
      const newMetadata = {
        ["priority_" + (k as string)]: globals.counter,
        ["group_" + (k as string)]: metadata[i].igroup,
      };
      globals.counter++;
      model[PersistenceKeys.METADATA] = {
        ...model[PersistenceKeys.METADATA],
        ...newMetadata,
      };
    });
  }

  return onCreate(saveGroupSort, data, groupsort);
}

@model()
class NewTestModel extends BaseModel {
  [key: string]: any;
  @pk({ type: "Number" })
  id!: string;

  @required()
  @groupSortMetadata(
    { igroup: "B", ipriority: 20, igroupPriority: 30 },
    { group: "B", priority: 20, groupPriority: 30 }
  )
  name!: string;

  @groupSortMetadata(
    { igroup: "A", ipriority: 10, igroupPriority: 20 },
    { group: "A", priority: 10, groupPriority: 20 }
  )
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  @groupSortMetadata(
    { igroup: "A", ipriority: 10, igroupPriority: 10 },
    { group: "A", priority: 10, groupPriority: 10 }
  )
  email!: string;

  @required()
  @groupSortMetadata(
    { igroup: "B", ipriority: 20, igroupPriority: 5 },
    { group: "B", priority: 20, groupPriority: 5 }
  )
  address!: string;

  constructor(arg?: ModelArg<NewTestModel>) {
    super(arg);
  }
}

/**
 * This is the order of the decorators execution because:
 * - email and nif have a higher priority as a group ( priority:10 )
 * - email (groupPriority:10) have a higher priority than nif (groupPriority:20)
 * - address and name have a lower priority as a group ( priority:20 )
 * - address (groupPriority:5) have a higher priority than name (groupPriority:30)
 */
const priorityA = ["email", "nif", "address", "name"];

describe("Adapter", () => {
  let repo: RamRepository<NewTestModel>;
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = Repository.forModel<NewTestModel, RamRepository<NewTestModel>>(
      NewTestModel
    );
  });

  it("instantiates", () => {
    expect(adapter).toBeDefined();
    expect(Adapter["_cache"]["ram"]).toBeDefined();
  });

  let created: NewTestModel, updated: NewTestModel;

  it("creates", async () => {
    const model = new NewTestModel({
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789",
      email: "test_email@example.com",
      address: "test_address",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();

    //check correct order of the decorator execution
    const metadata = created[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();

    priorityA.forEach((val, i) => {
      expect(metadata["priority_" + val]).toEqual(i);
    });
  });

  it("reads", async () => {
    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances

    const metadata = created[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();

    priorityA.forEach((val, i) => {
      expect(metadata["priority_" + val]).toEqual(i);
    });
  });

  it("updates", async () => {
    const toUpdate = new NewTestModel(
      Object.assign({}, created, {
        name: "new_test_name",
      })
    );

    updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedOn", "name", "updatedBy")).toEqual(
      true
    ); // minus the expected changes
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id);
    expect(deleted).toBeDefined();
    expect(deleted.equals(updated)).toEqual(true);

    await expect(repo.read(created.id)).rejects.toThrow(NotFoundError);
  });
});
