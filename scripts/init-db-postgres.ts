// Script para inicializar o banco de dados PostgreSQL
// Execute: bun run scripts/init-db-postgres.ts

import { initDatabase } from '../lib/db';

async function main() {
  console.log('Inicializando banco de dados PostgreSQL...');
  try {
    await initDatabase();
    console.log('✅ Banco de dados inicializado com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    process.exit(1);
  }
}

main();

