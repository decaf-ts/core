import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import { BaseModel, manyToMany, pk } from "../../src/index";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";

jest.setTimeout(500000);

@model()
export class TestUserModel extends BaseModel {
  @pk()
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
  @pk()
  id!: number;

  @required()
  name: string = "user";

  @manyToMany(
    TestUserModel,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    false
  )
  users!: TestUserModel[];

  constructor(m?: ModelArg<TestRoleModel>) {
    super(m);
  }
}

@model()
export class FaultyTestUserModel extends BaseModel {
  @pk()
  id!: number;

  @required()
  name!: string;

  @manyToMany(
    () => FaultyRoleModel,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true // Should cause error because both sides have populate=true
  )
  roles!: FaultyRoleModel[];

  constructor(m?: ModelArg<FaultyTestUserModel>) {
    super(m);
  }
}

@model()
export class FaultyRoleModel extends BaseModel {
  @pk()
  id!: number;

  @required()
  name: string = "user";

  @manyToMany(
    FaultyTestUserModel,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true // Should cause error because both sides have populate=true
  )
  users!: FaultyTestUserModel[];

  constructor(m?: ModelArg<FaultyRoleModel>) {
    super(m);
  }
}

@model()
export class TestUserNoPopulateModel extends BaseModel {
  @pk()
  id!: number;

  @required()
  name!: string;

  @manyToMany(
    () => TestRolePopulateModel,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    false
  )
  roles!: TestRolePopulateModel[];

  constructor(m?: ModelArg<TestUserNoPopulateModel>) {
    super(m);
  }
}

@model()
export class TestRolePopulateModel extends BaseModel {
  @pk()
  id!: number;

  @required()
  name: string = "user";

  @manyToMany(
    TestUserNoPopulateModel,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true
  )
  users!: TestUserNoPopulateModel[];

  constructor(m?: ModelArg<TestRolePopulateModel>) {
    super(m);
  }
}

describe("Many to many relations", () => {
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  let sequenceRepository: RamRepository<Seq>;
  let userRepository: RamRepository<TestUserModel>;
  let roleRepository: RamRepository<TestRoleModel>;
  let userNoPopRepository: RamRepository<TestUserNoPopulateModel>;
  let rolePopRepository: RamRepository<TestRolePopulateModel>;
  let faultyRoleRepository: RamRepository<FaultyRoleModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();
    userRepository = new Repository(adapter, TestUserModel);
    roleRepository = new Repository(adapter, TestRoleModel);
    userNoPopRepository = new Repository(adapter, TestUserNoPopulateModel);
    rolePopRepository = new Repository(adapter, TestRolePopulateModel);
    faultyRoleRepository = new Repository(adapter, FaultyRoleModel);
  });

  const userRole = {
    name: "UserRole",
  };
  const adminRole = {
    name: "AdminRole",
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

  async function createTestData(userClass: any, roleClass: any) {
    const userRepo: any = Repository.forModel(userClass, adapter.alias);
    const roleRepo: any = Repository.forModel(roleClass, adapter.alias);

    const createdUser = await userRepo.create(new userClass(user));
    const readUser = await userRepo.read(createdUser.id);
    const createdUser2 = await userRepo.create(new userClass(user2));
    const readUser2 = await userRepo.read(createdUser2.id);
    const createdRole = await roleRepo.create(new roleClass(role));
    const createdRole2 = await roleRepo.create(new roleClass(role2));
    const readRole = await roleRepo.read(createdRole.id);
    const readRole2 = await roleRepo.read(createdRole2.id);
    const createdUserWithRoleIds = await userRepo.create(
      new userClass({
        name: "Albertthree",
        roles: [createdRole.id, createdRole2.id],
      })
    );
    const readUserWithRoleIds = await userRepo.read(createdUserWithRoleIds.id);
    const createdRoleWithUserIds = await roleRepo.create(
      new roleClass({
        name: "SuperUser",
        users: [createdUser.id, createdUser2.id],
      })
    );
    const readRoleWithUserIds = await roleRepo.read(createdRoleWithUserIds.id);

    return {
      readUser,
      readUser2,
      readRole,
      readRole2,
      readUserWithRoleIds,
      readRoleWithUserIds,
    };
  }

  it("Creates a many to many relation", async () => {
    const {
      readUser,
      readUser2,
      readRole,
      readRole2,
      readUserWithRoleIds,
      readRoleWithUserIds,
    } = await createTestData(TestUserModel, TestRoleModel);

    expect(readUser.roles).toBeDefined();
    expect(readUser.roles.length).toBe(1);
    expect(readUser.roles[0].name).toBe("UserRole");
    expect(readRole.users).toBeDefined();
    expect(readRole.users.length).toBe(2);
    expect(typeof readRole.users[0]).toBe("number");

    expect(readUser2.roles).toBeDefined();
    expect(readUser2.roles.length).toBe(2);
    expect(
      readUser2.roles.find((r: TestRoleModel) => r.name === "UserRole")
    ).toBeDefined();
    expect(
      readUser2.roles.find((r: TestRoleModel) => r.name === "AdminRole")
    ).toBeDefined();
    expect(readRole2.users).toBeDefined();
    expect(readRole2.users.length).toBe(1);
    expect(typeof readRole2.users[0]).toBe("number");

    expect(readUserWithRoleIds.roles).toBeDefined();
    expect(readUserWithRoleIds.roles.length).toBe(2);
    expect(
      readUserWithRoleIds.roles.find(
        (r: TestRoleModel) => r.name === "UserRole"
      )
    ).toBeDefined();
    expect(
      readUserWithRoleIds.roles.find(
        (r: TestRoleModel) => r.name === "AdminRole"
      )
    ).toBeDefined();

    expect(readRoleWithUserIds.users).toBeDefined();
    expect(readRoleWithUserIds.users.length).toBe(2);
    expect(typeof readRoleWithUserIds.users[0]).toBe("number");
  });
  it("Creates a many to many relation with inverse side creations", async () => {
    const {
      readUser,
      readUser2,
      readRole,
      readRole2,
      readUserWithRoleIds,
      readRoleWithUserIds,
    } = await createTestData(TestUserNoPopulateModel, TestRolePopulateModel);

    expect(readUser.roles).toBeDefined();
    expect(readUser.roles.length).toBe(1);
    expect(typeof readUser.roles[0]).toBe("number");

    expect(readUser2.roles).toBeDefined();
    expect(readUser2.roles.length).toBe(2);
    expect(typeof readUser2.roles[0]).toBe("number");

    expect(readRole.users).toBeDefined();
    expect(readRole.users.length).toBe(2);
    expect(
      readRole.users.find((r: TestUserNoPopulateModel) => r.name === "Albert")
    ).toBeDefined();
    expect(
      readRole.users.find((r: TestUserNoPopulateModel) => r.name === "Albertwo")
    ).toBeDefined();

    expect(readRole2.users).toBeDefined();
    expect(readRole2.users.length).toBe(1);

    expect(readUserWithRoleIds.roles).toBeDefined();
    expect(readUserWithRoleIds.roles.length).toBe(2);
    expect(typeof readUserWithRoleIds.roles[0]).toBe("number");

    expect(readRoleWithUserIds.users).toBeDefined();
    expect(readRoleWithUserIds.users.length).toBe(2);
    expect(
      readRoleWithUserIds.users.find(
        (r: TestUserNoPopulateModel) => r.name === "Albert"
      )
    ).toBeDefined();
    expect(
      readRoleWithUserIds.users.find(
        (r: TestUserNoPopulateModel) => r.name === "Albertwo"
      )
    ).toBeDefined();
  });
  it("fails when both sides have populate true", async () => {
    await expect(
      faultyRoleRepository.create(new FaultyRoleModel(role))
    ).rejects.toThrow(/Bidirectional populate is not allowed/);
  });
});
