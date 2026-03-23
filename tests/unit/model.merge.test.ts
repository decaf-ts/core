import { Model } from "@decaf-ts/decorator-validation";
import { TestAddressModel, TestCountryModel } from "./models";

describe("Model.merge", () => {
  it("merges two instances when the model contains a one-to-one inner model", () => {
    const oldModel = new TestAddressModel({
      id: 1,
      street: "Old Street",
      doorNumber: "10",
      apartmentNumber: "A",
      areaCode: "1000-001",
      city: "Lisbon",
      country: new TestCountryModel({
        id: 1,
        name: "Portugal",
        countryCode: "pt",
        locale: "pt_PT",
      }),
    });

    const newModel = new TestAddressModel({
      city: "Porto",
      country: new TestCountryModel({
        id: 2,
        name: "Spain",
        countryCode: "es",
        locale: "es_ES",
      }),
    });

    const merged = Model.merge(oldModel, newModel, TestAddressModel);

    expect(merged).toBeInstanceOf(TestAddressModel);
    expect(merged.street).toEqual("Old Street");
    expect(merged.city).toEqual("Porto");

    expect(merged.country).toBeInstanceOf(TestCountryModel);
    expect(merged.country.id).toEqual(2);
    expect(merged.country.name).toEqual("Spain");
    expect(merged.country.countryCode).toEqual("es");
    expect(merged.country.locale).toEqual("es_ES");
  });

  it("merges two instances when the one-to-one inner model is set to undefined", () => {
    const oldModel = new TestAddressModel({
      id: 1,
      street: "Old Street",
      doorNumber: "10",
      apartmentNumber: "A",
      areaCode: "1000-001",
      city: "Lisbon",
      country: new TestCountryModel({
        id: 1,
        name: "Portugal",
        countryCode: "pt",
        locale: "pt_PT",
      }),
    });

    const newModel = new TestAddressModel({
      city: "Porto",
      country: undefined,
    });

    const merged = Model.merge(oldModel, newModel, TestAddressModel);

    expect(merged).toBeInstanceOf(TestAddressModel);
    expect(merged.street).toEqual("Old Street");
    expect(merged.city).toEqual("Porto");
    expect(merged.country).toBeUndefined();
  });
});
