import { prisma } from '../db/prisma.js';

// Seleção explícita: contatos privados não são necessários para esta consulta.
const select = {
  id: true,
  tipo: true,
  status: true,
  criadoEm: true,
  mensagem: true,
  nomeLocalRelato: true,
  nomeLocalSugerido: true,
  local: { select: { nome: true } },
};

export function listar(pagina) {
  return prisma.envio.findMany({
    select,
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: 51,
    skip: (pagina - 1) * 50,
  });
}

export function buscar(id) {
  return prisma.envio.findUnique({ where: { id }, select });
}

export function nomeLocal(envio) {
  return envio.local?.nome ?? envio.nomeLocalRelato ?? envio.nomeLocalSugerido ?? 'Não informado';
}
