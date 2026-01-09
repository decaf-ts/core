// import * as fs from "fs";
// import * as path from "path";
// import { normalizeImport } from "@decaf-ts/utils";
//
// function getWorkspaceTargetAndMode(): {target: TestingTargets, mode: WorkspaceType} {
//   const target = process.env[TestTargetEnvKey] || TestingTargets.SRC;
//   if (!Object.values(TestingTargets).includes(target as TestingTargets))
//     throw new Error(
//       `Invalid testing target: ${target}. Use one of: src | lib | dist.`
//     );
//
//   const mode = process.env[TestTargetEnvKey] || WorkspaceType.commonjs;
//   if (!Object.values(WorkspaceType).includes(mode as WorkspaceType))
//     throw new Error(
//       `Invalid testing mode: ${mode}. Use one of: esm | commonjs.`
//     );
//
//   console.log(`Using workspace target "${target} in ${mode}"`);
//
//   return {
//     target: target as TestingTargets,
//     mode: mode as WorkspaceType
//   }
// }
//
// function ensureTargetAvailable(resolvedPath: string, target: TestingTargets): void {
//   if (!fs.existsSync(resolvedPath))
//     throw new Error(
//       `Cannot locate build artifacts for target "${target}". Expected to find "${resolvedPath}". ` +
//       `Did you run the build for ${target}?`
//     );
// }
//
// export type TestingModule = typeof import("../src");
//
// export enum TestingTargets {
//   SRC = "src",
//   LIB = "lib",
//   DIST = "dist"
// }
//
// export enum WorkspaceType {
//   commonjs = "commonjs",
//   esm = "esm",
// }
//
// export const TestTargetEnvKey = "DECAF_TEST_TARGET";
// export const TestTypeEnvKey = "DECAF_TEST_TYPE";
//
// export async function getTestingModule(){
//   const {target, mode} = getWorkspaceTargetAndMode()
//   const specifier = target;
//   const extension = TestingTargets.SRC === target
//     ? ".ts"
//     : (mode === WorkspaceType.esm ? ".js" : ".cjs")
//   const entryFileName =
//     target === TestingTargets.DIST
//       ? (this.package.name.includes("/")
//         ? this.package.name.split("/")[1] + extension
//         : this.package.name + extension)
//       : "index" + extension;
//   const resolved = path.resolve(
//     path.join(__dirname, "..", "..", specifier, entryFileName)
//   );
//   ensureTargetAvailable(resolved, target);
//
//   const loaded = await normalizeImport(import(specifier));
//   return loaded as TestingModule;
// }
//
//
// export const Testing = new TestingModule();
