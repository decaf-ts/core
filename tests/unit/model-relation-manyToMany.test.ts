import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import {
  BaseModel,
  index,
  manyToMany,
  manyToMany,
  manyToMany,
  oneToMany,
  pk,
  populate,
  Sequence,
} from "../../src/index";
import {
  email,
  max,
  min,
  minlength,
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

jest.setTimeout(500000);

@model()
export class TestUserModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  @index()
  name!: string;

  @required()
  @email()
  @index()
  email!: string;

  @required()
  @min(18)
  @index()
  age!: number;

  @manyToMany(() => TestRoleModel, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  @required()
  @minlength(1)
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

@model()
export class TestRoleNoPopModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  name: string = "user";

  @manyToMany(
    TestUserModel,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @required()
  @minlength(1)
  users!: Partial<TestUserModel>[];

  constructor(m?: ModelArg<TestRoleModel>) {
    super(m);
  }
}

@model()
export class TestUserRoleModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  name: string = "user";

  @oneToMany(
    TestUserModel,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @required()
  user!: Partial<TestUserModel>;

  @oneToMany(
    TestRoleModel,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @required()
  role!: Partial<TestRoleModel>;

  constructor(m?: ModelArg<TestUserRoleModel>) {
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
  let roleNoPopModelRepository: RamRepository<TestRoleNoPopModel>;
  let roleUserJunctionRepository: RamRepository<TestUserRoleModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    userRepository = new Repository(adapter, TestUserModel);
    roleRepository = new Repository(adapter, TestRoleModel);
    roleNoPopModelRepository = new Repository(adapter, TestRoleNoPopModel);
    roleUserJunctionRepository = new Repository(adapter, TestUserRoleModel);
  });

  const user1 = {
    name: "testuser",
    email: "test@test.com",
    age: 25,
  };
  const user2 = {
    name: "testuser2",
    email: "test2@test.com",
    age: 30,
  };
  const role1 = {
    name: "user",
  };

  const role2 = {
    name: "admin",
  };

  const users: Partial<TestUserModel>[] = [
    {
      name: "testuser",
      email: "test@test.com",
      age: 25,
      roles: [role1 as TestRoleModel],
    },
    {
      name: "testuser2",
      email: "test2@test.com",
      age: 30,
      roles: [role1 as TestRoleModel, role2 as TestRoleModel],
    },
  ];

  const roles: Partial<TestRoleModel>[] = [
    {
      name: "user",
      users: [user1 as TestUserModel],
    },
    {
      name: "admin",
      users: [user1 as TestUserModel, user2 as TestUserModel],
    },
  ];

  let createdRole1: TestRoleModel;
  let createdRole2: TestRoleModel;
  let updatedRole: TestRoleModel;
  let createdUser1: TestUserModel;
  let createdUser2: TestUserModel;
  let updatedUser: TestUserModel;

  let userSequence: Sequence;

  it("Creates a many to many relation", async () => {
    userSequence = await adapter.Sequence({
      name: Sequence.pk(TestUserModel),
      type: "Number",
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });

    const roleSequence = await adapter.Sequence({
      name: Sequence.pk(TestRoleModel),
      type: "Number",
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });

    const currentUser = (await userSequence.current()) as number;
    const curRole = (await roleSequence.current()) as number;
    createdUser1 = await userRepository.create(new TestUserModel(users[0]));
    createdUser2 = await userRepository.create(new TestUserModel(users[1]));
    createdRole1 = await roleRepository.create(new TestRoleModel(roles[0]));
    createdRole2 = await roleRepository.create(new TestRoleModel(roles[1]));
    const createdRoles = [createdRole1, createdRole2];
    const createdUsers = [createdUser1, createdUser2];

    const roleSeq = await sequenceRepository.read(Sequence.pk(TestRoleModel));
    expect(roleSeq.current).toEqual(curRole + 2);

    const userSeq = await sequenceRepository.read(Sequence.pk(TestUserModel));
    createdUser1 = await userRepository.read(userSeq.current);
    expect(userSeq.current).toEqual(currentUser + 2);

    for (const createdRole of createdRoles) {
      expect(createdRole).toBeInstanceOf(TestRoleModel);
      expect(createdRole.id).toBeDefined();
      expect(createdRole.createdAt).toBeDefined();
      expect(createdRole.updatedAt).toBeDefined();
    }

    // read user created via cascade from role create
    createdUser1 = await userRepository.read(userSeq.current);

    expect(createdUser1).toBeInstanceOf(TestUserModel);
    expect(createdUser1.id).toBeDefined();
    expect(createdUser1.createdAt).toBeDefined();
    expect(createdUser1.updatedAt).toBeDefined();

    // const { user: userFromRelation } = createdRoles[0];
    // expect(createdUser1.equals(userFromRelation)).toEqual(true);

    // roles.forEach((p: any) => {
    //   testRole(p);
    // });
  });
  it("Creates a many to many relation using Id", async () => {
    userSequence = await adapter.Sequence({
      name: Sequence.pk(TestUserModel),
      type: "Number",
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });

    const roleSequence = await adapter.Sequence({
      name: Sequence.pk(TestRoleModel),
      type: "Number",
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });

    const user = {
      name: "testuser",
      email: "test@test.com",
      age: 25,
    };
    createdUser1 = await userRepository.create(new TestUserModel(user));
    const role1: Partial<TestRoleModel> = {
      name: "000-0000000",
      user: createdUser1.id,
    };

    const role2: Partial<TestRoleModel> = {
      name: "351",
      user: createdUser1.id,
    };

    const userSeq = await sequenceRepository.read(Sequence.pk(TestUserModel));
    const currentUser = (await userSequence.current()) as number;

    expect(userSeq.current).toEqual(currentUser);
    expect(createdUser1).toBeInstanceOf(TestUserModel);
    expect(createdUser1.id).toBeDefined();
    expect(createdUser1.createdAt).toBeDefined();
    expect(createdUser1.updatedAt).toBeDefined();

    const curRole = (await roleSequence.current()) as number;
    createdRole1 = await roleRepository.create(new TestRoleModel(role1));
    createdRole2 = await roleRepository.create(new TestRoleModel(role2));
    const createdRoles = [createdRole1, createdRole2];

    const roleSeq = await sequenceRepository.read(Sequence.pk(TestRoleModel));
    expect(roleSeq.current).toEqual(curRole + 2);

    for (const createdRole of createdRoles) {
      expect(createdRole).toBeInstanceOf(TestRoleModel);
      expect(createdRole.id).toBeDefined();
      expect(createdRole.createdAt).toBeDefined();
      expect(createdRole.updatedAt).toBeDefined();
    }

    const { user: userFromRelation } = createdRoles[0];
    expect(createdUser1).toEqual(userFromRelation);
  });
  it("Updates a many to many relation", async () => {
    createdUser1 = await userRepository.create(new TestUserModel(user));
    const userRead = await userRepository.read(createdUser1.id);
    role1.users = userRead.id as any;
    const createdRole = await roleRepository.create(new TestRoleModel(role1));

    const toUpdate = new TestRoleModel(
      Object.assign({}, createdRole, {
        areaCode: "30",
        number: "987-654321",
      })
    );

    const toUpdateAndCreateUser = new TestRoleModel(
      Object.assign({}, createdRole, {
        areaCode: "30",
        number: "987-654321",
        user: new TestUserModel({
          name: "asdf",
          email: "asdf@test.com",
          age: 26,
        }),
      })
    );

    const updatedRole = await roleRepository.update(toUpdate);
    const read = await roleRepository.read(updatedRole.id);
    expect(read).toBeDefined();

    const updatedUserAndRole = await roleRepository.update(
      toUpdateAndCreateUser
    );
    const readUserAndRole = await roleRepository.read(updatedUserAndRole.id);
    expect(readUserAndRole).toBeDefined();
    console.log("asdf", read);
  });
  it("Deletes a many to many relation", async () => {
    createdUser1 = await userRepository.create(new TestUserModel(user));
    const userRead = await userRepository.read(createdUser1.id);
    role1.users = userRead.id as any;
    const createdRole = await roleRepository.create(new TestRoleModel(role1));
    await roleRepository.delete(createdRole.id);
    await expect(roleRepository.read(createdRole.id)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(userRepository.read(createdUser1.id)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
  it("Ensure no population when populate is disabled in a many-to-many relation", async () => {
    userSequence = await adapter.Sequence({
      name: Sequence.pk(TestUserModel),
      type: "Number",
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });

    const roleSequence = await adapter.Sequence({
      name: Sequence.pk(TestRoleNoPopModel),
      type: "Number",
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });

    const currentUser = (await userSequence.current()) as number;
    const curRole = (await roleSequence.current()) as number;
    createdUser1 = await userRepository.create(new TestUserModel(users));
    const role = {
      name: "351",
      level: "000-0000000",
      users: createdUser1.id,
    };
    createdRole1 = await roleNoPopModelRepository.create(
      new TestRoleNoPopModel(role)
    );

    const roleSeq = await sequenceRepository.read(
      Sequence.pk(TestRoleNoPopModel)
    );
    expect(roleSeq.current).toEqual(curRole + 1);

    const userSeq = await sequenceRepository.read(Sequence.pk(TestUserModel));
    createdUser1 = await userRepository.read(userSeq.current);
    expect(userSeq.current).toEqual(currentUser + 1);
    expect(createdRole1.users).toEqual(createdUser1.id);

    const toUpdate = new TestRoleNoPopModel(
      Object.assign({}, createdRole1, {
        areaCode: "30",
        number: "987-654321",
      })
    );

    const updated = await roleNoPopModelRepository.update(toUpdate);
    expect(updated.users).toEqual(createdUser1.id);

    const deleted = await roleNoPopModelRepository.delete(createdRole1.id);
    expect(deleted.users).toEqual(createdUser1.id);
  });
});
