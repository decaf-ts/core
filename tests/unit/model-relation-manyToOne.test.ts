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
  let userManyToOneRepository: RamRepository<TestUserManyToOneModel>;
  let testDummyCountryModelRepository: RamRepository<TestDummyCountry>;
  let testPhoneModelRepository: RamRepository<TestPhoneModel>;
  let testPhoneManyToOneModelRepository: RamRepository<TestPhoneManyToOneModel>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let testDummyPhoneModelRepository: RamRepository<TestDummyPhone>;
  let testAddressModelRepository: RamRepository<TestAddressModel>;
  let testCountryModelRepository: RamRepository<TestCountryModel>;
  let noPopulateOnceModelRepository: RamRepository<NoPopulateOnceModel>;
  let noPopulateManyModelRepository: RamRepository<NoPopulateManyModel>;

  let model: any;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    userRepository = new Repository(adapter, TestUserModel);
    userManyToOneRepository = new Repository(adapter, TestUserManyToOneModel);
    testPhoneModelRepository = new Repository(adapter, TestPhoneModel);
    testPhoneManyToOneModelRepository = new Repository(adapter, TestPhoneManyToOneModel);
    testAddressModelRepository = new Repository(adapter, TestAddressModel);
    testCountryModelRepository = new Repository(adapter, TestCountryModel);
    testDummyCountryModelRepository = new Repository(adapter, TestDummyCountry);
    testDummyPhoneModelRepository = new Repository(adapter, TestDummyPhone);
    noPopulateOnceModelRepository = new Repository(
      adapter as any,
      NoPopulateOnceModel
    );
    noPopulateManyModelRepository = new Repository(
      adapter as any,
      NoPopulateManyModel
    );

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
      

      let created: TestPhoneModel;
      let updated: TestPhoneModel;

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


        const curUser = (await userSequence.current()) as number;
        const curPhone = (await phoneSequence.current()) as number;
        created = await testPhoneModelRepository.create(new TestPhoneModel(phones));

        
        const phoneSeq = await sequenceRepository.read(
          Sequence.pk(TestPhoneModel)
        );
        expect(phoneSeq.current).toEqual(curPhone + 1);


        const seq = Sequence.pk(TestPhoneModel)
        const userSeq = await sequenceRepository.read(
          Sequence.pk(TestUserModel)
        );
        expect(userSeq.current).toEqual(curUser + 2);

        console.log("asdf")
        // testUser(created);

        // const read = await userRepository.read(created.id);
        // testUser(read);

        // const { address, phones } = read;
        // expect(created.equals(read)).toEqual(true);
        // expect(created.address.equals(address)).toEqual(true);

        // const read2 = await testAddressModelRepository.read(created.address.id);
        // testAddress(read2);
        // expect(read2.equals(created.address)).toEqual(true);

        // const read3 = await testCountryModelRepository.read(address.country.id);
        // testCountry(read3);
        // expect(read3.equals(address.country)).toEqual(true);
        // phones.forEach((p: any) => {
        //   testPhone(p);
        // });
      });

    });

  });
});
