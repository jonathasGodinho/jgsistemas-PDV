import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as carregarEnv } from 'dotenv';

/**
 * globalSetup do vitest (T-01.02).
 *
 * Carrega o DATABASE_URL do banco de TESTE (backend/.env.test, decisão D-16) e
 * aplica o schema Prisma antes da suíte rodar. Nunca usa o .env de produção.
 *
 * Enquanto não existir migração versionada, aplica o schema com `db push`.
 * Quando existir (a partir de T-02.02), passa a usar `migrate reset` para
 * garantir um banco limpo e coerente com as migrações.
 */
export default function setup() {
  const raiz = process.cwd();
  const { parsed } = carregarEnv({ path: `${raiz}/.env.test` });
  const url = parsed?.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL de teste ausente: crie backend/.env.test (D-16).');
  }
  if (!url.includes('jg_test')) {
    throw new Error('Recusando rodar a suíte: DATABASE_URL de teste não aponta para jg_test.');
  }

  const dirMigracoes = `${raiz}/prisma/migrations`;
  const temMigracoes =
    existsSync(dirMigracoes) && readdirSync(dirMigracoes).some((d) => /^\d+_/.test(d));

  const comando = temMigracoes
    ? 'npx prisma migrate reset --force --skip-seed --skip-generate'
    : 'npx prisma db push --force-reset --skip-generate';

  execSync(comando, {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
