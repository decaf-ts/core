import { CascadeMetadata } from "./types";

export enum OrderDirection {
  ASC = "asc",

  DSC = "desc",
}

export enum Cascade {
  CASCADE = "cascade",
  NONE = "none",
}

export const DefaultCascade: CascadeMetadata = {
  update: Cascade.CASCADE,
  delete: Cascade.NONE,
};
