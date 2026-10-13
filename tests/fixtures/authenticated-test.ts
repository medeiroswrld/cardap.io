import { test as base, expect } from "@playwright/test";

// UI tests of the private demo require a real, previously authenticated session.
// No test-only authentication bypass is added to the application.
export const test = base.extend<{ demoAdmin: boolean }>({
  demoAdmin: [false, { option: true }],
  storageState: async ({ demoAdmin }, provide) => {
    if (demoAdmin) {
      const state = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;
      test.skip(
        !state,
        "Gestão privada: configure PLAYWRIGHT_ADMIN_STORAGE_STATE com uma sessão autenticada de teste.",
      );
      await provide(state);
    } else await provide(undefined);
  },
});
export { expect };
