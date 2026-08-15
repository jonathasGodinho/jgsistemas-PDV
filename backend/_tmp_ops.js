const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.operador.findMany({ take: 5, select: { id: true, matricula: true, nome: true, senha: true, ehAdmin: true, trocarSenha: true } })
  .then(r => { console.log(JSON.stringify(r, null, 1)); return p.$disconnect(); })
  .catch(e => { console.error('ERRO', e.message); process.exit(1); });
