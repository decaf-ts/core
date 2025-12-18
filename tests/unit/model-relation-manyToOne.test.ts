import {
  NoPopulateManyModel,
  NoPopulateOnceModel,
  testAddress,
  TestAddressModel,
  testCountry,
  TestCountryModel,
  TestDummyCountry,
  TestDummyPhone,
  testPhone,
  TestPhoneManyToOneModel,
  testUser,
  TestUserManyToOneModel,
} from "./models";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import { BaseModel, index, manyToOne, oneToMany, oneToOne, pk, Sequence } from "../../src/index";
import { email, min, minlength, model, Model, ModelArg, required } from "@decaf-ts/decorator-validation";

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

  @manyToOne(TestUserModel, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  @required()
  @minlength(1)
  user!: TestUserModel;

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
  let testPhoneModelRepository: RamRepository<TestPhoneModel>;

  let model: any;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    userRepository = new Repository(adapter, TestUserModel);
    testPhoneModelRepository = new Repository(adapter, TestPhoneModel);

    model = {
      name: "test country",
      countryCode: "tst",
      locale: "ts_TS",
    };
  });

  describe("Complex relations Test", () => {
    let sequenceModel: Sequence;
    let sequenceCountry: Sequence;
   
    describe("Many to one relations", () => {
      const phones =
      {
        areaCode: "351",
        number: "000-0000000",
        user: {
          name: "testuser",
          email: "test@test.com",
          age: 25,
          address: {
            street: "test street",
            doorNumber: "test door",
            apartmentNumber: "test number",
            areaCode: "test area code",
            city: "test city",
            country: {
              name: "test country",
              countryCode: "tst",
              locale: "ts_TS",
            },
          },
        }
      };
      
      const user = {
        name: "testuser",
        email: "test@test.com",
        age: 25,
        phones: [
          {
            areaCode: "351",
            number: "000-0000000",
          },
          {
            areaCode: "351",
            number: "000-0000001",
          },
        ],
      };
      

      let createdPhone: TestPhoneModel;
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
        // Possibly the user needs to be created throught the relation
        createdUser = await userRepository.create(new TestUserModel(user));
        createdPhone = await testPhoneModelRepository.create(new TestPhoneModel(phones));


          const phoneSeq = await sequenceRepository.read(
            Sequence.pk(TestPhoneModel)
          );
          expect(phoneSeq.current).toEqual(curPhone + 1);

          const userSeq = await sequenceRepository.read(
            Sequence.pk(TestUserModel)
          );
          expect(userSeq.current).toEqual(currentUser + 1);

      
          expect(createdPhone).toBeInstanceOf(TestPhoneModel);
          expect(createdPhone.id).toBeDefined();
          expect(createdPhone.createdAt).toBeDefined();
          expect(createdPhone.updatedAt).toBeDefined();

          // const read = await userRepository.read(createdUser.id);
          // testUser(read);

          // const { phones } = read;
          // expect(createdUser.equals(read)).toEqual(true);

          // phones.forEach((p: any) => {
          //   testPhone(p);
          // });
        });

      });

    });
  });
