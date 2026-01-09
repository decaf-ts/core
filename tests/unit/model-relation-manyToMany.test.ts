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
    true
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

  it("Creates a many to many relation", async () => {
    const createdUser = await userRepository.create(new TestUserModel(user));
    const readUser = await userRepository.read(createdUser.id);
    const createdUser2 = await userRepository.create(new TestUserModel(user2));
    const readUser2 = await userRepository.read(createdUser2.id);
    const createdRole = await roleRepository.create(new TestRoleModel(role));
    const createdRole2 = await roleRepository.create(new TestRoleModel(role2));
    const readRole = await roleRepository.read(createdRole.id);
    const readRole2 = await roleRepository.read(createdRole2.id);
    console.log("readRole2:", readRole2);

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
    expect(readUser.roles[0].name).toBe("UserRole");
    expect(readRole.users).toBeDefined();
    expect(readRole.users.length).toBe(2);
    expect(typeof readRole.users[0]).toBe("number");

    expect(readUser2.roles).toBeDefined();
    expect(readUser2.roles.length).toBe(2);
    expect(readUser2.roles.find((r) => r.name === "UserRole")).toBeDefined();
    expect(readUser2.roles.find((r) => r.name === "AdminRole")).toBeDefined();
    expect(readRole2.users).toBeDefined();
    expect(readRole2.users.length).toBe(1);
    expect(typeof readRole2.users[0]).toBe("number");

    expect(readUserWithRoleIds.roles).toBeDefined();
    expect(readUserWithRoleIds.roles.length).toBe(2);
    expect(
      readUserWithRoleIds.roles.find((r) => r.name === "UserRole")
    ).toBeDefined();
    expect(
      readUserWithRoleIds.roles.find((r) => r.name === "AdminRole")
    ).toBeDefined();

    expect(readRoleWithUserIds.users).toBeDefined();
    expect(readRoleWithUserIds.users.length).toBe(2);
    expect(typeof readRoleWithUserIds.users[0]).toBe("number");
  });
  it("Creates a many to many relation with inverse side creations", async () => {
    const createdUser = await userNoPopRepository.create(
      new TestUserNoPopulateModel(user)
    );
    const readUser = await userNoPopRepository.read(createdUser.id);
    const createdUser2 = await userNoPopRepository.create(
      new TestUserNoPopulateModel(user2)
    );
    const readUser2 = await userNoPopRepository.read(createdUser2.id);
    const createdRole = await rolePopRepository.create(
      new TestRolePopulateModel(role)
    );
    const createdRole2 = await rolePopRepository.create(
      new TestRolePopulateModel(role2)
    );
    const readRole = await rolePopRepository.read(createdRole.id);
    const readRole2 = await rolePopRepository.read(createdRole2.id);
    console.log("readRole2:", readRole2);

    const createdUserWithRoleIds = await userNoPopRepository.create(
      new TestUserNoPopulateModel({
        name: "Albertthree",
        roles: [createdRole.id, createdRole2.id],
      })
    );
    const readUserWithRoleIds = await userNoPopRepository.read(
      createdUserWithRoleIds.id
    );
    const createdRoleWithUserIds = await rolePopRepository.create(
      new TestRolePopulateModel({
        name: "SuperUser",
        users: [createdUser.id, createdUser2.id],
      })
    );
    const readRoleWithUserIds = await rolePopRepository.read(
      createdRoleWithUserIds.id
    );

    // Inverse side creations
    const createdNoPopUser = await userNoPopRepository.create(
      new TestUserNoPopulateModel(user)
    );
    const readNoPopUser = await userNoPopRepository.read(createdNoPopUser.id);
    const createdNoPopUser2 = await userNoPopRepository.create(
      new TestUserNoPopulateModel(user2)
    );
    const readNoPopUser2 = await userNoPopRepository.read(createdNoPopUser2.id);
    const createdPopRole = await rolePopRepository.create(
      new TestRolePopulateModel(role)
    );
    const createdPopRole2 = await rolePopRepository.create(
      new TestRolePopulateModel(role2)
    );
    const readPopRole = await rolePopRepository.read(createdPopRole.id);
    const readPopRole2 = await rolePopRepository.read(createdPopRole2.id);
    console.log("readPopRole2:", readPopRole2);

    expect(readUser.roles).toBeDefined();
    expect(readUser.roles.length).toBe(1);
    expect(typeof readUser.roles[0]).toBe("number");

    expect(readUser2.roles).toBeDefined();
    expect(readUser2.roles.length).toBe(2);
    expect(typeof readUser2.roles[0]).toBe("number");

    expect(readRole.users).toBeDefined();
    expect(readRole.users.length).toBe(2);

    expect(readRole2.users).toBeDefined();
    expect(readRole2.users.length).toBe(1);

    expect(readUserWithRoleIds.roles).toBeDefined();
    expect(readUserWithRoleIds.roles.length).toBe(2);
    expect(typeof readUserWithRoleIds.roles[0]).toBe("number");

    expect(readRoleWithUserIds.users).toBeDefined();
    expect(readRoleWithUserIds.users.length).toBe(2);
  });
  it("fails when both sides have populate", async () => {
    await expect(
      faultyRoleRepository.create(new FaultyRoleModel(role))
    ).rejects.toThrow(/Bidirectional populate is not allowed/);
  });
});
