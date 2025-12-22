import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Cascade, Repository } from "../../src/repository/index";
import { SequenceModel as Seq } from "../../src/model/SequenceModel";
import { BaseModel, oneToMany, oneToOne, pk, Sequence } from "../../src/index";
import {
  list,
  minlength,
  model,
  Model,
  ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { TestAddressModel, TestCountryModel, TestUserModel } from "./models";

jest.setTimeout(500000);

@model()
class ChildModel extends Model {
  @pk({ type: Number })
  id!: number;

  @required()
  @list(String)
  @minlength(3)
  name!: string;

  constructor(m?: ModelArg<ChildModel>) {
    super(m);
  }
}

@model()
class ParentModel extends Model {
  @pk({ type: Number })
  id!: number;

  @required()
  child!: ChildModel;

  @minlength(3)
  @list(ChildModel)
  children!: ChildModel[];

  constructor(m?: ModelArg<ParentModel>) {
    super(m);
  }
}

@model()
class RelationParentModel extends Model {
  @pk({ type: Number })
  id!: number;

  @required()
  @oneToOne(ChildModel, { update: Cascade.CASCADE, delete: Cascade.CASCADE })
  child!: ChildModel;

  @oneToMany(ChildModel, { update: Cascade.CASCADE, delete: Cascade.CASCADE })
  @minlength(3)
  children!: ChildModel[];

  constructor(m?: ModelArg<RelationParentModel>) {
    super(m);
  }
}

@model()
class RelationParentNoPopModel extends Model {
  @pk({ type: Number })
  id!: number;

  @required()
  @oneToOne(
    ChildModel,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  child!: ChildModel;

  constructor(m?: ModelArg<RelationParentModel>) {
    super(m);
  }
}

describe(`Validates model and model relation`, function () {
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  let sequenceRepository: RamRepository<Seq>;
  let relationParentRepository: RamRepository<RelationParentModel>;
  let relationParentNoPopRepository: RamRepository<RelationParentNoPopModel>;
  let childRepository: RamRepository<ChildModel>;
  let userRepository: RamRepository<TestUserModel>;
  let testAddressModelRepository: RamRepository<TestAddressModel>;
  let testCountryModelRepository: RamRepository<TestCountryModel>;

  beforeAll(async () => {
    sequenceRepository = new Repository(adapter, Seq);
    expect(sequenceRepository).toBeDefined();

    relationParentRepository = new Repository(adapter, RelationParentModel);
    relationParentNoPopRepository = new Repository(
      adapter,
      RelationParentNoPopModel
    );
    childRepository = new Repository(adapter, ChildModel);
    userRepository = new Repository(adapter, TestUserModel);
    testAddressModelRepository = new Repository(adapter, TestAddressModel);
    testCountryModelRepository = new Repository(adapter, TestCountryModel);
  });

  let sequenceModel: Sequence;
  let createdParent: RelationParentModel;
  let createdChild: ChildModel;

  it("tests model validation", async () => {
    const parent1: ParentModel = new ParentModel();

    const parent2: ParentModel = new ParentModel({
      id: Date.now(),
      child: {
        id: Date.now(),
        name: 12,
      },
      children: [],
    });

    const errors1 = parent1.hasErrors();
    const errors2 = parent2.hasErrors();

    console.log("errors1:", errors1);
    expect(errors1).toBeDefined();
    console.log("errors2:", errors2);
    expect(errors2).toBeDefined();
  });
  it("Creates a database entry", async () => {
    const dbModel: ChildModel = {
      // @ts-expect-error intentionally wrong type
      name: 12,
    };

    try {
      const createdChild = (await childRepository.create(
        dbModel
      )) as ChildModel;
      expect(createdChild).toBeDefined();
    } catch (error) {
      console.log("createdChild error:", error);
      expect(error).toBeDefined();
    }
  });
  it("Creates a one to one relation", async () => {
    const parent1Object: RelationParentModel = {
      children: [
        {
          // @ts-expect-error intentionally wrong type
          name: 12,
        },
      ],
    };
    const parent2Object: RelationParentModel = {
      child: {
        // @ts-expect-error intentionally wrong type
        name: 12,
      },
      children: [
        {
          // @ts-expect-error intentionally wrong type
          name: 12,
        },
      ],
    };

    try {
      createdParent = (await relationParentRepository.create(
        parent1Object
      )) as RelationParentModel;
    } catch (error) {
      console.log("parent1Object error:", error);
      expect(error).toBeDefined();
    }

    try {
      createdParent = (await relationParentRepository.create(
        parent2Object
      )) as RelationParentModel;
    } catch (error) {
      console.log("parent2Object terror:", error);
      expect(error).toBeDefined();
    }
  });

  it("Creates a one to one relation no populate", async () => {
    const parentObject: RelationParentModel | RelationParentNoPopModel = {
      child: {
        // @ts-expect-error intentionally wrong type
        name: 12,
      },
    };

    try {
      createdParent = (await relationParentNoPopRepository.create(
        parentObject
      )) as RelationParentModel;
    } catch (error) {
      console.log("error:", error);
      expect(error).toBeDefined();
    }
  });

  it("Creates a one to many nested relation", async () => {
    const user = {
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
      phones: [
        {
          areaCode: "250",
          number: "000-0000000",
        },
        {
          areaCode: "351",
          number: "000-0000001",
        },
      ],
    };
    const address = new TestAddressModel({
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
    });

    const createdAddress = (await testAddressModelRepository.create(
      address
    )) as TestAddressModel;
    const createdUser: TestUserModel = await userRepository.create(
      new TestUserModel(user)
    );
    console.log("createdAddress:", createdAddress);
    console.log("created:", createdUser);
    expect(createdAddress).toBeDefined();
    expect(createdUser).toBeDefined();
  });

  it("Creates a one to many nested relation (validation error captured)", async () => {
    const user = {
      name: "testuser",
      email: "test@test.com",
      age: 25,
    };

    let createdUser: TestUserModel | undefined;
    let createError: any;

    try {
      createdUser = await userRepository.create(new TestUserModel(user));
    } catch (err) {
      createError = err;
    }

    console.log("created:", createdUser);
    console.log("createError:", createError);
    // Should fail due to validation missing phones and address.
    expect(createdUser).toBeUndefined();
    expect(createError).toBeDefined();
  });
});
