import { RamAdapter } from "./adapter1";
import { DummyAdapter } from "./adapter2";

const ram = new RamAdapter();
const dummy = new DummyAdapter();

export { ram, dummy };
