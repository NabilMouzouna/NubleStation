export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSuperAdmin } = await import("./lib/db/seed.js");
    await ensureSuperAdmin();
  }
}
