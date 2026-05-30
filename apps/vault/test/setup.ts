import { afterEach } from "vitest";
import { resetConfigCache } from "../src/config.js";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://nuble:nuble@localhost:5432/nuble_dev";
}
if (!process.env.INTERNAL_HMAC_SECRET) {
  process.env.INTERNAL_HMAC_SECRET = "test-secret-vault-min32chars!!!!!";
}

afterEach(() => {
  resetConfigCache();
});
