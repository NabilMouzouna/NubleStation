import { resetConfigCache } from "../src/config.js";
import { TEST_HMAC_SECRET } from "./helpers/sign.js";

// Ensure minimum env is set before any test loads config.
// DATABASE_URL is required by the schema even though Orbit has no pool.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://nuble:nuble@localhost:5432/nuble_dev";
}
if (!process.env.INTERNAL_HMAC_SECRET) {
  process.env.INTERNAL_HMAC_SECRET = TEST_HMAC_SECRET;
}

// Reset cache after each test so env overrides in beforeEach take effect.
import { afterEach } from "vitest";
afterEach(() => {
  resetConfigCache();
});
