import type { Logger } from "pino";

export type HonoVariables = {
  log: Logger;
  /** Set by requireSession middleware once a valid session cookie is resolved. */
  userId?: string;
};
