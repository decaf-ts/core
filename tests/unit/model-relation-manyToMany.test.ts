import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import { BaseModel, manyToMany, pk } from "../../src/index";
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
    true
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
      roles: [userRole],
    };
    const user2 = {
      name: "Albertwo",
      roles: [userRole, adminRole],
    };

    const role = {
      name: userRole.name,
      users: [user, user2],
    };

    const role2 = {
      name: adminRole.name,
      users: [user],
    };

    const createdUser = await userRepository.create(new TestUserModel(user));
    const createdUser2 = await userRepository.create(new TestUserModel(user2));
    const readUser = await userRepository.read(createdUser.id);
    const readUser2 = await userRepository.read(createdUser2.id);

    const createdRole = await roleRepository.create(new TestRoleModel(role));
    const createdRole2 = await roleRepository.create(new TestRoleModel(role2));
    const readRole = await roleRepository.read(createdRole.id);
    const readRole2 = await roleRepository.read(createdRole2.id);

    const createdUserWithRoleIds = await userRepository.create(
      new TestUserModel({
        name: "Albertthree",
        roles: [createdRole.id, createdRole2.id],
      })
    );
    const readUserWithRoleIds = await userRepository.read(
      createdUserWithRoleIds.id
    );
    const createdRoleWithUserIds = await roleRepository.create(
      new TestRoleModel({
        name: "SuperUser",
        users: [createdUser.id, createdUser2.id],
      })
    );
    const readRoleWithUserIds = await roleRepository.read(
      createdRoleWithUserIds.id
    );

    expect(readUser.roles).toBeDefined();
    expect(readUser.roles.length).toBe(1);
    expect(readUser.roles[0].name).toBe("User");

    expect(readUser2.roles).toBeDefined();
    expect(readUser2.roles.length).toBe(2);
    expect(readUser2.roles.find((r) => r.name === "User")).toBeDefined();
    expect(readUser2.roles.find((r) => r.name === "Admin")).toBeDefined();

    expect(readRole.users).toBeDefined();
    expect(readRole.users.length).toBe(2);
    expect(readRole.users.find((u) => u.name === "Albert")).toBeDefined();
    expect(readRole.users.find((u) => u.name === "Albertwo")).toBeDefined();

    expect(readRole2.users).toBeDefined();
    expect(readRole2.users.length).toBe(1);
    expect(readRole2.users[0].name).toBe("Albert");

    expect(readUserWithRoleIds.roles).toBeDefined();
    expect(readUserWithRoleIds.roles.length).toBe(2);
    expect(
      readUserWithRoleIds.roles.find((r) => r.name === "User")
    ).toBeDefined();
    expect(
      readUserWithRoleIds.roles.find((r) => r.name === "Admin")
    ).toBeDefined();

    expect(readRoleWithUserIds.users).toBeDefined();
    expect(readRoleWithUserIds.users.length).toBe(2);
    expect(
      readRoleWithUserIds.users.find((u) => u.name === "Albert")
    ).toBeDefined();
    expect(
      readRoleWithUserIds.users.find((u) => u.name === "Albertwo")
    ).toBeDefined();
  });
});
