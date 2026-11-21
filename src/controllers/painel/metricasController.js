import * as visitas from '../../services/visitasService.js';
import * as enviosService from '../../services/enviosPainelService.js';
import { TIPOS, ROTULOS } from './enviosController.js';
import { anoMesBrasilia, dataValida, fimDoDia } from '../../utils/periodo.js';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function filtrosInvalidos(next) {
  next(Object.assign(new Error('Filtros inválidos.'), { status: 400 }));
}

export async function metricas(req, res, next) {
  if (
    ['ano', 'inicio', 'fim'].some(
      (c) => req.query[c] !== undefined && typeof req.query[c] !== 'string',
    )
  ) {
    return filtrosInvalidos(next);
  }
  const anoAtual = anoMesBrasilia().ano;
  const inicio = req.query.inicio ?? '';
  const fim = req.query.fim ?? '';
  const anoTexto = req.query.ano || String(anoAtual);
  const ano = Number(anoTexto);
  const dataInicio = dataValida(inicio);
  const dataFim = dataValida(fim);
  if (
    !/^\d{4}$/.test(anoTexto) ||
    ano < 2020 ||
    ano > anoAtual + 1 ||
    (inicio && !dataInicio) ||
    (fim && !dataFim) ||
    (dataInicio && dataFim && dataInicio > dataFim)
  ) {
    return filtrosInvalidos(next);
  }

  const periodo = {};
  if (dataInicio) periodo.gte = dataInicio;
  if (dataFim) periodo.lt = fimDoDia(dataFim);

  const [porMes, anos, grupos] = await Promise.all([
    visitas.porMes(ano),
    visitas.anosComRegistro(anoAtual),
    enviosService.contarPorTipoESituacao(periodo),
  ]);

  const situacoes = Object.keys(ROTULOS);
  const envios = Object.keys(TIPOS).map((tipo) => {
    const porSituacao = Object.fromEntries(
      situacoes.map((s) => [
        s,
        grupos.find((g) => g.tipo === tipo && g.status === s)?._count._all ?? 0,
      ]),
    );
    return {
      tipo,
      porSituacao,
      total: Object.values(porSituacao).reduce((soma, n) => soma + n, 0),
    };
  });

  res.render('painel/metricas', {
    title: 'Métricas',
    ano,
    anos: anos.includes(ano) ? anos : [ano, ...anos].sort((a, b) => b - a),
    visitasPorMes: porMes.meses.map((m) => ({ ...m, nome: MESES[m.mes - 1] })),
    visitasTotal: porMes.total,
    maiorMes: Math.max(1, ...porMes.meses.map((m) => m.total)),
    envios,
    situacoes,
    rotulosSituacao: ROTULOS,
    rotulosTipo: TIPOS,
    enviosTotal: envios.reduce((soma, e) => soma + e.total, 0),
    filtros: { ano: String(ano), inicio, fim },
  });
}
