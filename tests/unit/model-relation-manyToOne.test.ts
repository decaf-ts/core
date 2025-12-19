import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import {
  BaseModel,
  index,
  manyToOne,
  oneToMany,
  oneToOne,
  pk,
  Sequence,
} from "../../src/index";
import {
  email,
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

  phones!: TestPhoneModel[];

  constructor(m?: ModelArg<TestUserModel>) {
    super(m);
  }
}

@model()
export class TestPhoneModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  areaCode!: string;

  @required()
  number!: string;

  @manyToOne(TestUserModel)
  @required()
  @minlength(1)
  user!: TestUserModel | string | number;

  constructor(m?: ModelArg<TestPhoneModel>) {
    super(m);
  }
}

describe(`Complex Database`, function () {
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  let sequenceRepository: RamRepository<Seq>;
  let userRepository: RamRepository<TestUserModel>;
  let phoneModelRepository: RamRepository<TestPhoneModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    userRepository = new Repository(adapter, TestUserModel);
    phoneModelRepository = new Repository(adapter, TestPhoneModel);
  });

  describe("Many to one relations", () => {
    const user = {
      name: "testuser",
      email: "test@test.com",
      age: 25,
    };
    const phone1 = {
      areaCode: "351",
      number: "000-0000000",
      user: user,
    };

    const phone2 = {
      areaCode: "351",
      number: "000-0000001",
      user: user,
    };

    let createdPhone1: TestPhoneModel;
    let createdPhone2: TestPhoneModel;
    let updatedPhone: TestPhoneModel;
    let createdUser: TestUserModel;
    let updatedUser: TestUserModel;

    let userSequence: Sequence;

    it("Creates a many to one relation", async () => {
      userSequence = await adapter.Sequence({
        name: Sequence.pk(TestUserModel),
        type: "Number",
        startWith: 0,
        incrementBy: 1,
        cycle: false,
      });

      const phoneSequence = await adapter.Sequence({
        name: Sequence.pk(TestPhoneModel),
        type: "Number",
        startWith: 0,
        incrementBy: 1,
        cycle: false,
      });

      const currentUser = (await userSequence.current()) as number;
      const curPhone = (await phoneSequence.current()) as number;
      createdPhone1 = await phoneModelRepository.create(
        new TestPhoneModel(phone1)
      );
      createdPhone2 = await phoneModelRepository.create(
        new TestPhoneModel(phone2)
      );
      const createdPhones = [createdPhone1, createdPhone2];

      const phoneSeq = await sequenceRepository.read(
        Sequence.pk(TestPhoneModel)
      );
      expect(phoneSeq.current).toEqual(curPhone + 2);

      const userSeq = await sequenceRepository.read(Sequence.pk(TestUserModel));
      createdUser = await userRepository.read(userSeq.current);
      expect(userSeq.current).toEqual(currentUser + 2);

      for (const createdPhone of createdPhones) {
        expect(createdPhone).toBeInstanceOf(TestPhoneModel);
        expect(createdPhone.id).toBeDefined();
        expect(createdPhone.createdAt).toBeDefined();
        expect(createdPhone.updatedAt).toBeDefined();
      }

      // read user created via cascade from phone create
      createdUser = await userRepository.read(userSeq.current);

      expect(createdUser).toBeInstanceOf(TestUserModel);
      expect(createdUser.id).toBeDefined();
      expect(createdUser.createdAt).toBeDefined();
      expect(createdUser.updatedAt).toBeDefined();

      // const { user: userFromRelation } = createdPhones[0];
      // expect(createdUser.equals(userFromRelation)).toEqual(true);

      // phones.forEach((p: any) => {
      //   testPhone(p);
      // });
    });
    it("Creates a many to one relation using Id", async () => {
      userSequence = await adapter.Sequence({
        name: Sequence.pk(TestUserModel),
        type: "Number",
        startWith: 0,
        incrementBy: 1,
        cycle: false,
      });

      const phoneSequence = await adapter.Sequence({
        name: Sequence.pk(TestPhoneModel),
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
      createdUser = await userRepository.create(new TestUserModel(user));
      const phone1: Partial<TestPhoneModel> = {
        areaCode: "351",
        number: "000-0000000",
        user: createdUser.id,
      };

      const phone2: Partial<TestPhoneModel> = {
        areaCode: "351",
        number: "000-0000001",
        user: createdUser.id,
      };

      const userSeq = await sequenceRepository.read(Sequence.pk(TestUserModel));
      const currentUser = (await userSequence.current()) as number;

      expect(userSeq.current).toEqual(currentUser);
      expect(createdUser).toBeInstanceOf(TestUserModel);
      expect(createdUser.id).toBeDefined();
      expect(createdUser.createdAt).toBeDefined();
      expect(createdUser.updatedAt).toBeDefined();

      const curPhone = (await phoneSequence.current()) as number;
      createdPhone1 = await phoneModelRepository.create(
        new TestPhoneModel(phone1)
      );
      createdPhone2 = await phoneModelRepository.create(
        new TestPhoneModel(phone2)
      );
      const createdPhones = [createdPhone1, createdPhone2];

      const phoneSeq = await sequenceRepository.read(
        Sequence.pk(TestPhoneModel)
      );
      expect(phoneSeq.current).toEqual(curPhone + 2);

      for (const createdPhone of createdPhones) {
        expect(createdPhone).toBeInstanceOf(TestPhoneModel);
        expect(createdPhone.id).toBeDefined();
        expect(createdPhone.createdAt).toBeDefined();
        expect(createdPhone.updatedAt).toBeDefined();
      }

      const { user: userFromRelation } = createdPhones[0];
      expect(createdUser).toEqual(userFromRelation);
    });
    it("Updates a many to one relation", async () => {
      createdUser = await userRepository.create(new TestUserModel(user));
      const userRead = await userRepository.read(createdUser.id);
      phone1.user = userRead.id as any;
      const createdPhone = await phoneModelRepository.create(
        new TestPhoneModel(phone1)
      );

      const toUpdate = new TestPhoneModel(
        Object.assign({}, createdPhone, {
          areaCode: "30",
          number: "987-654321",
        })
      );

      const toUpdateAndCreateUser = new TestPhoneModel(
        Object.assign({}, createdPhone, {
          areaCode: "30",
          number: "987-654321",
          user: new TestUserModel({
            name: "asdf",
            email: "asdf@test.com",
            age: 26,
          }),
        })
      );

      const updatedPhone = await phoneModelRepository.update(toUpdate);
      const read = await phoneModelRepository.read(updatedPhone.id);
      expect(read).toBeDefined();

      const updatedUserAndPhone = await phoneModelRepository.update(
        toUpdateAndCreateUser
      );
      const readUserAndPhone = await phoneModelRepository.read(
        updatedUserAndPhone.id
      );
      expect(readUserAndPhone).toBeDefined();
      console.log("asdf", read);
    });
  });
});
