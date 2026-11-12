import { prisma } from '../../db/prisma.js';

const POR_PAGINA = 50;

function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}T03:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor ? data : null;
}

export async function listar(req, res) {
  if (
    ['pessoa', 'acao', 'inicio', 'fim', 'pagina'].some(
      (chave) => req.query[chave] !== undefined && typeof req.query[chave] !== 'string',
    )
  ) {
    return res.status(400).send('Filtros inválidos.');
  }
  const pessoa = typeof req.query.pessoa === 'string' ? req.query.pessoa : '';
  const acao = typeof req.query.acao === 'string' ? req.query.acao : '';
  const inicio = typeof req.query.inicio === 'string' ? req.query.inicio : '';
  const fim = typeof req.query.fim === 'string' ? req.query.fim : '';
  const paginaSolicitada =
    typeof req.query.pagina === 'string' && /^[1-9]\d*$/.test(req.query.pagina)
      ? Math.min(Number(req.query.pagina), 100000)
      : 1;

  const dataInicio = dataValida(inicio);
  const dataFim = dataValida(fim);
  if (
    (pessoa && (!/^[1-9]\d*$/.test(pessoa) || Number(pessoa) > 2147483647)) ||
    (inicio && !dataInicio) ||
    (fim && !dataFim) ||
    (dataInicio && dataFim && dataInicio > dataFim)
  ) {
    return res.status(400).send('Filtros inválidos.');
  }

  const pessoas = await prisma.admin.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });
  const acoes = await prisma.logAuditoria.findMany({
    distinct: ['acao'],
    select: { acao: true },
    orderBy: { acao: 'asc' },
  });

  const onde = {};
  if (pessoa) onde.adminId = Number(pessoa);
  if (acao) onde.acao = acao;
  if (dataInicio || dataFim) {
    onde.criadoEm = {};
    if (dataInicio) onde.criadoEm.gte = dataInicio;
    if (dataFim) {
      const exclusivo = new Date(dataFim);
      exclusivo.setUTCDate(exclusivo.getUTCDate() + 1);
      onde.criadoEm.lt = exclusivo;
    }
  }

  const total = await prisma.logAuditoria.count({ where: onde });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaSolicitada, paginas);
  const registros = await prisma.logAuditoria.findMany({
    where: onde,
    select: {
      id: true,
      criadoEm: true,
      acao: true,
      entidade: true,
      entidadeId: true,
      admin: { select: { nome: true, email: true } },
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    skip: (pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });
  res.render('painel/auditoria', {
    title: 'Histórico de ações',
    registros,
    pessoas,
    acoes,
    filtros: { pessoa, acao, inicio, fim },
    pagina,
    paginas,
    total,
  });
}
