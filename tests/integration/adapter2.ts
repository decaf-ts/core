import { DummyAdapter } from "./DummyAdapter";
import { Adapter } from "../../src/index";
DummyAdapter.decoration();
Adapter.setCurrent("dummy");

export { DummyAdapter };
