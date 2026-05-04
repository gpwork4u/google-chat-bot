import { test as base, createBdd } from 'playwright-bdd';

/**
 * 共用測試狀態（跨 step definitions 共享）
 */
export type TestState = {
  lastApiResponse: Response | null;
  lastApiBody: Record<string, unknown> | null;
  wsConnected: boolean;
  currentDraftId: string | null;
  draftIds: string[];
};

/**
 * 擴充 playwright-bdd 的 test，加入 testState fixture
 */
export const test = base.extend<{
  testState: TestState;
}>({
  testState: async ({}, use) => {
    const state: TestState = {
      lastApiResponse: null,
      lastApiBody: null,
      wsConnected: false,
      currentDraftId: null,
      draftIds: [],
    };
    await use(state);
  },
});

export { test };
export const { Given, When, Then } = createBdd(test);
