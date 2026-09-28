import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Golden replays in other JS engines: SpiderMonkey and JavaScriptCore. */
export default defineConfig({
  test: {
    name: 'golden-browsers',
    include: ['packages/replay/src/golden.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
