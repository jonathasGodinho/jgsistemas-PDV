import { defineConfig } from 'vitest/config';
import { config as carregarEnv } from 'dotenv';

// A suíte sempre roda contra o banco de teste (D-16), nunca a produção.
const { parsed: envTeste } = carregarEnv({ path: `${process.cwd()}/.env.test` });

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    globalSetup: ['./tests/setup.ts'],
    env: envTeste ?? {},
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
