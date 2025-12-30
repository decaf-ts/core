import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import {
  BaseModel,
  manyToMany,
  pk,
} from "../../src/index";
import {
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

jest.setTimeout(500000);

@model()
export class TestUserModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  name!: string;

  @manyToMany(
    () => TestRoleModel,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true,
  )
  roles!: TestRoleModel[];

  constructor(m?: ModelArg<TestUserModel>) {
    super(m);
  }
}

@model()
export class TestRoleModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  name: string = "user";

  @manyToMany(TestUserModel, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  @required()
  @minlength(1)
  users!: TestUserModel[];

  constructor(m?: ModelArg<TestRoleModel>) {
    super(m);
  }
}


// @model()
// export class TestUserRoleModel extends BaseModel {
//   @pk({ type: "Number" })
//   id!: number;

//   @required()
//   name: string = "user";

//   @oneToMany(
//     TestUserModel,
//     { update: Cascade.CASCADE, delete: Cascade.CASCADE },
//     false
//   )
//   @required()
//   user!: Partial<TestUserModel>;

//   @manyToMany(
//     TestRoleModel,
//     { update: Cascade.CASCADE, delete: Cascade.CASCADE },
//     false
//   )
//   @required()
//   role!: Partial<TestRoleModel>;

//   constructor(m?: ModelArg<TestUserRoleModel>) {
//     super(m);
//   }
// }

describe("Many to many relations", () => {
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  let sequenceRepository: RamRepository<Seq>;
  let userRepository: RamRepository<TestUserModel>;
  let roleRepository: RamRepository<TestRoleModel>;
  // let roleUserJunctionRepository: RamRepository<TestUserRoleModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    userRepository = new Repository(adapter, TestUserModel);
    roleRepository = new Repository(adapter, TestRoleModel);
    // roleUserJunctionRepository = new Repository(adapter, TestUserRoleModel);
  });


  it("Creates a many to many relation", async () => {
    const userRole = {
      name: "User",
    };
    const adminRole = {
      name: "Admin",
    };
    const user = {
      name: "Albert",
      roles: [userRole]
    };
    const user2 = {
      name: "Albertwo",
      roles: [userRole, adminRole]
    };

    const createdUser = await userRepository.create(new TestUserModel(user));

    const readUser = await userRepository.read(createdUser.id);
    console.log("asdf");
  });
});
