import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import {
  BaseModel,
  getAndConstructJunctionTable,
  manyToMany,
  PersistenceKeys,
  pk,
} from "../../src/index";
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userRepository: RamRepository<TestUserModel>;
  let roleRepository: RamRepository<TestRoleModel>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userNoPopRepository: RamRepository<TestUserNoPopulateModel>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let rolePopRepository: RamRepository<TestRolePopulateModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();
    userRepository = new Repository(adapter, TestUserModel);
    roleRepository = new Repository(adapter, TestRoleModel);
    userNoPopRepository = new Repository(adapter, TestUserNoPopulateModel);
    rolePopRepository = new Repository(adapter, TestRolePopulateModel);
  });

  const userRole = {
    name: "UserRole",
  };
  const adminRole = {
    name: "AdminRole",
  };
  const user = {
    name: "Albert",
    roles: [userRole, adminRole],
  };
  const user2 = {
    name: "Albertwo",
    roles: [userRole],
  };
  const role = {
    name: userRole.name,
    users: [user, user2],
  };
  const role2 = {
    name: adminRole.name,
    users: [user],
  };

  async function createTestData(
    UserClass: typeof TestUserModel,
    RoleClass: typeof TestRoleModel
  ) {
    const userRepo: any = Repository.forModel(UserClass, adapter.alias);
    const roleRepo: any = Repository.forModel(RoleClass, adapter.alias);
    const createdRole = await roleRepo.create(new RoleClass(role));
    const createdRole2 = await roleRepo.create(new RoleClass(role2));
    const createdUser = await userRepo.create(new UserClass(user));
    const createdUser2 = await userRepo.create(new UserClass(user2));
    const createdUserWithRoleIds = await userRepo.create(
      new UserClass({
        name: "Albertthree",
        roles: [createdRole.id, createdRole2.id],
      })
    );
    const createdRoleWithUserIds = await roleRepo.create(
      new RoleClass({
        name: "SuperUser",
        users: [createdUser.id, createdUser2.id],
      })
    );

    return {
      createdUser,
      createdUser2,
      createdRole,
      createdRole2,
      createdUserWithRoleIds,
      createdRoleWithUserIds,
    };
  }

  it("Creates a many to many relation", async () => {
    const UserClass = TestUserModel;
    const RoleClass = TestRoleModel;
    const userRepo = Repository.forModel(UserClass);
    const roleRepo: any = Repository.forModel(RoleClass);
    const {
      createdUser,
      createdUser2,
      createdRole,
      createdRole2,
      createdUserWithRoleIds,
      createdRoleWithUserIds,
    } = await createTestData(UserClass, RoleClass);

    const { JunctionModel } = getAndConstructJunctionTable(
      UserClass as any,
      RoleClass
    );
    const junctionRepository = Repository.forModel(JunctionModel);
    // const results = await repository?.readAll(recordIds);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const users = await userRepo.readAll([
      createdUser.id,
      createdUser2.id,
      createdUserWithRoleIds.id,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const roles = await roleRepo.readAll([
      createdRole.id,
      createdRole2.id,
      createdRoleWithUserIds.id,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const entries = await junctionRepository.select().execute();

    expect(createdRole.users.length).toBe(2);
    expect(typeof createdRole.users[0]).toBe("number");

    expect(createdUser.roles.length).toBe(2);
    expect(createdUser.roles[0]).toBeInstanceOf(RoleClass);
    expect(
      createdUser.roles.filter(
        (r: typeof RoleClass) => r.name === "UserRole" || r.name === "AdminRole"
      )?.length
    ).toBe(2);

    expect(createdUserWithRoleIds.roles.length).toBe(2);
    expect(
      createdUserWithRoleIds.roles.filter(
        (r: typeof RoleClass) => r.name === "UserRole" || r.name === "AdminRole"
      )?.length
    ).toBe(2);

    expect(createdRoleWithUserIds.users.length).toBe(2);
    expect(typeof createdRoleWithUserIds.users[0]).toBe("number");
  });
  it("Creates a many to many relation with inverse side creations", async () => {
    const UserClass = TestUserNoPopulateModel;
    const RoleClass = TestRolePopulateModel;
    const {
      createdUser,
      createdRole,
      createdUserWithRoleIds,
      createdRoleWithUserIds,
    } = await createTestData(UserClass, RoleClass);

    expect(createdUser.roles.length).toBe(2);
    expect(typeof createdUser.roles[0]).toBe("number");

    expect(createdRole.users.length).toBe(2);
    expect(createdRole.users[0]).toBeInstanceOf(UserClass);
    expect(
      createdRole.users.filter(
        (r: typeof UserClass) => r.name === "Albert" || r.name === "Albertwo"
      )?.length
    ).toBe(2);

    expect(createdUserWithRoleIds.roles.length).toBe(2);
    expect(typeof createdUserWithRoleIds.roles[0]).toBe("number");

    expect(createdRoleWithUserIds.users.length).toBe(2);
    expect(
      createdRole.users.filter(
        (r: typeof UserClass) => r.name === "Albert" || r.name === "Albertwo"
      )?.length
    ).toBe(2);
  });
  it("Updates a many to many relation", async () => {
    const UserClass = TestUserModel;
    const RoleClass = TestRoleModel;
    const userRepo = Repository.forModel(UserClass);
    const newUserName = "John";
    const { createdRole, createdUserWithRoleIds } = await createTestData(
      UserClass,
      RoleClass
    );

    const toUpdate = new UserClass(
      Object.assign({}, createdUserWithRoleIds, {
        name: newUserName,
        roles: [createdRole.id],
      })
    );

    const updatedUser = await userRepo.update(toUpdate);
    expect(updatedUser.name).toBe(newUserName);
    const users = await userRepo.select().execute();
    console.log("userRoles:", users);
  });
  it("Deletes a many to many relation", async () => {
    // createdUser = await userRepository.create(new TestUserModel(user));
    // const userRead = await userRepository.read(createdUser.id);
    // phone1.user = userRead.id as any;
    // const createdRoleWithUserIds = await phoneRepository.create(
    //   new TestPhoneModel(phone1)
    // );
    // await phoneRepository.delete(createdRoleWithUserIds.id);
    // await expect(
    //   phoneRepository.read(createdRoleWithUserIds.id)
    // ).rejects.toBeInstanceOf(NotFoundError);
    // await expect(userRepository.read(createdUser.id)).rejects.toBeInstanceOf(
    //   NotFoundError
    // );
  });
  it("fails when both sides have populate true", async () => {
    const { Metadata } = await import("@decaf-ts/decoration");
    const roleRelationsMeta = Metadata.get(
      TestRoleModel,
      PersistenceKeys.RELATIONS
    );
    if (roleRelationsMeta && roleRelationsMeta.users) {
      // Change populate to true on the other side
      roleRelationsMeta.users.populate = true;
      Metadata.set(TestRoleModel, PersistenceKeys.RELATIONS, roleRelationsMeta);
    }
    await expect(
      roleRepository.create(new TestRoleModel(role))
    ).rejects.toThrow(/Bidirectional populate is not allowed/);
  });
});
