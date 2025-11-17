import { Adapter } from "../../src/index";
import { RamAdapter, RamFlavour } from "../../src/ram/index";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

export { RamAdapter, RamFlavour };
