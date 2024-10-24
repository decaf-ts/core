import { CascadeMetadata } from "../repository";

export type RelationsMetadata = {
  class: string;
  cascade: CascadeMetadata;
  populate: boolean;
};
