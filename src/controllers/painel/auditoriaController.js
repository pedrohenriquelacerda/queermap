import * as auditoria from '../../services/auditoriaService.js';
import * as fmt from '../../utils/formatadores.js';

// As datas do filtro são dias no horário de Brasília. O Brasil não tem horário de verão
// desde 2019, então o fuso é fixo em -03:00 (o mesmo usado em fmt.dataHora).
const FUSO_BRASILIA = '-03:00';

// "2026-11-05" -> início desse dia em Brasília; null se a data não existir (ex.: 30/02).
function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}T00:00:00${FUSO_BRASILIA}`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor ? data : null;
}

function filtrosInvalidos(next) {
  next(Object.assign(new Error('Filtros inválidos.'), { status: 400 }));
}

export async function listar(req, res, next) {
  if (
    ['pessoa', 'acao', 'inicio', 'fim', 'pagina'].some(
      (chave) => req.query[chave] !== undefined && typeof req.query[chave] !== 'string',
    )
  ) {
    return filtrosInvalidos(next);
  }
  const pessoa = req.query.pessoa ?? '';
  const acao = req.query.acao ?? '';
  const inicio = req.query.inicio ?? '';
  const fim = req.query.fim ?? '';
  const paginaSolicitada = /^[1-9]\d*$/.test(req.query.pagina ?? '')
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
    return filtrosInvalidos(next);
  }

  const onde = {};
  if (pessoa) onde.adminId = Number(pessoa);
  if (acao) onde.acao = acao;
  if (dataInicio || dataFim) {
    onde.criadoEm = {};
    if (dataInicio) onde.criadoEm.gte = dataInicio;
    if (dataFim) {
      // Até o fim do dia escolhido: limite exclusivo no início do dia seguinte.
      const exclusivo = new Date(dataFim);
      exclusivo.setUTCDate(exclusivo.getUTCDate() + 1);
      onde.criadoEm.lt = exclusivo;
    }
  }

  const [[pessoas, acoes], total] = await Promise.all([
    auditoria.opcoesFiltro(),
    auditoria.contar(onde),
  ]);
  const paginas = Math.max(1, Math.ceil(total / auditoria.POR_PAGINA));
  const pagina = Math.min(paginaSolicitada, paginas);
  const registros = await auditoria.listar(onde, pagina);

  res.render('painel/auditoria', {
    title: 'Histórico de ações',
    registros,
    pessoas,
    // Ordenadas pelo rótulo que a equipe lê, não pelo código interno.
    acoes: acoes
      .map(({ acao: codigo }) => codigo)
      .sort((a, b) => fmt.acaoAuditoria(a).localeCompare(fmt.acaoAuditoria(b), 'pt-BR')),
    filtros: { pessoa, acao, inicio, fim },
    pagina,
    paginas,
    total,
  });
}
