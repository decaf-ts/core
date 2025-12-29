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
  populate,
  Sequence,
} from "../../src/index";
import {
  email,
  isEqual,
  min,
  minlength,
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

jest.setTimeout(500000);

@model()
export class TestPhoneStrongModel extends BaseModel {
  @pk({ type: "Number" })
  id!: number;

  @required()
  areaCode!: string;

  @required()
  number!: string;

  @manyToOne(() => TestUserModel, {update: Cascade.CASCADE, delete: Cascade.CASCADE}, true)
  @required()
  @minlength(1)
  user!: TestUserModel | string | number;

  constructor(m?: ModelArg<TestPhoneStrongModel>) {
    super(m);
  }
}

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

  @oneToMany(TestPhoneStrongModel, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  }, false)
  @required()
  @minlength(1)
  phones!: TestPhoneStrongModel[];

  constructor(m?: ModelArg<TestUserModel>) {
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
  let phoneRepository: RamRepository<TestPhoneStrongModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    userRepository = new Repository(adapter, TestUserModel);
    phoneRepository = new Repository(adapter, TestPhoneStrongModel);
  });

  describe("Many to one relations with One to many on the other side", () => {
    const user = {
      name: "testuser",
      email: "test@test.com",
      age: 25,
      phones: TestPhoneStrongModel[];
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

    let createdPhone: TestPhoneStrongModel;
    // let createdPhone2: TestPhoneModel;
    let createdUser: TestUserModel;
    let updatedUser: TestUserModel;

    let userSequence: Sequence;

    it("Creates a phone and ensures the user in the one-to-many side is updated", async () => {
      userSequence = await adapter.Sequence({
        name: Sequence.pk(TestUserModel),
        type: "Number",
        startWith: 0,
        incrementBy: 1,
        cycle: false,
      });

      const phoneSequence = await adapter.Sequence({
        name: Sequence.pk(TestPhoneStrongModel),
        type: "Number",
        startWith: 0,
        incrementBy: 1,
        cycle: false,
      });
      user.phones.push(phone1);

      createdUser = await userRepository.create(new TestUserModel(user)); // This should create a User with a OneToMany
      let phone = {
        areaCode: "351",
        number: "000-0000000",
        user: createdUser.id,
      };
      const readUser = await userRepository.read(createdUser.id);
      createdPhone = await phoneRepository.create(
        new TestPhoneStrongModel(phone)
      ); // This should now also make it so that the user 

      const areadUser = await userRepository.read(createdUser.id);
      const readPhone = await phoneRepository.read(createdPhone.id);
      expect(readUser.id).toEqual(readPhone.user.id); // This confirms the manyToOne connection is working, when creating the phone, it associated the createdUser.id passed, so the user id is being saved in the TestPhoneStrongModel

      // now the next step is checking if the phone id is being saved in the TestUserModel, which it isn't, it should come an array of phones but it comes undefined
      console.log("asdf")
    });
  });
});