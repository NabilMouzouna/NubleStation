import type { Logger } from "pino";

export type HonoVariables = {
  appId: string;
  userId: string;
  appSlug: string;
  log: Logger;
};
