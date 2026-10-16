import * as service from '../../services/enviosPainelService.js';
import { z } from '../../utils/validacao.js';

const situacao = z
  .object({ status: z.enum(service.STATUS), versaoSituacao: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const ROTULOS = {
  NOVO: 'Novo',
  EM_ANALISE: 'Em análise',
  RESOLVIDO: 'Resolvido',
  ARQUIVADO: 'Arquivado',
};
export const TIPOS = {
  SUGESTAO_LOCAL: 'Sugestão de local',
  ELOGIO: 'Elogio',
  RECLAMACAO: 'Reclamação',
  DISCRIMINACAO: 'Discriminação',
};
const filtros = z.object({
  tipo: z.enum(service.TIPOS).optional(),
  status: z.enum(service.STATUS).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
});
const notas = z
  .object({
    notasInternas: z.string().trim().max(5000),
    versaoNotas: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export async function listar(req, res) {
  const resultado = filtros.safeParse({
    tipo: req.query.tipo || undefined,
    status: req.query.status || undefined,
    pagina: req.query.pagina ?? 1,
  });
  if (!resultado.success) return res.status(400).json({ erro: 'Filtros inválidos.' });
  const consulta = resultado.data;
  const encontrados = await service.listar(consulta);
  const envios = encontrados.slice(0, 50);
  const proxima = encontrados.length > 50;
  if (querJson(req)) return res.json({ envios, pagina: consulta.pagina, proxima });
  const urlPagina = (pagina) => {
    const params = new URLSearchParams({ pagina: String(pagina) });
    if (consulta.tipo) params.set('tipo', consulta.tipo);
    if (consulta.status) params.set('status', consulta.status);
    return `?${params}`;
  };
  res.render('painel/envios/lista', {
    title: 'Envios',
    envios,
    filtros: consulta,
    proxima,
    urlPagina,
    tipos: TIPOS,
    situacoes: ROTULOS,
  });
}

export async function mostrar(req, res) {
  const id = Number(req.params.id);
  if (req.method === 'HEAD') {
    const envio = await service.buscar(id);
    return res.status(envio ? 200 : 404).end();
  }
  if (querJson(req)) return responder(req, res, await service.buscar(id));
  const lido = await service.alterar(id, req.admin.id, 'ler');
  if (!lido) return res.status(404).json({ erro: 'Envio não encontrado.' });
  const envio = await service.buscar(id);
  res.render('painel/envios/mostrar', {
    title: `Envio #${id}`,
    envio: protegerContato(envio),
    tipos: TIPOS,
    situacoes: ROTULOS,
  });
}

export async function ler(req, res) {
  responder(req, res, await service.alterar(Number(req.params.id), req.admin.id, 'ler'));
}

export async function mudarSituacao(req, res) {
  const resultado = situacao.safeParse(req.body);
  if (!resultado.success) return res.status(400).json({ erro: 'Situação inválida.' });
  const id = Number(req.params.id);
  try {
    responder(
      req,
      res,
      await service.alterar(
        id,
        req.admin.id,
        'situacao',
        resultado.data.status,
        resultado.data.versaoSituacao,
      ),
    );
  } catch (erro) {
    if (erro.status !== 409) throw erro;
    const atual = await service.buscar(id);
    if (!atual) return res.status(404).json({ erro: 'Envio não encontrado.' });
    res.status(409);
    if (querJson(req))
      return res.json({
        erro: erro.message,
        situacaoDigitada: resultado.data.status,
        envio: protegerContato(atual),
      });
    res.render('painel/envios/mostrar', {
      title: `Envio #${id}`,
      envio: protegerContato(atual),
      tipos: TIPOS,
      situacoes: ROTULOS,
      conflitoSituacao: erro.message,
      situacaoDigitada: resultado.data.status,
    });
  }
}

export async function anotar(req, res) {
  const resultado = notas.safeParse(req.body);
  if (!resultado.success) {
    return res.status(400).json({ erro: 'Informe uma anotação de até 5.000 caracteres.' });
  }
  const id = Number(req.params.id);
  try {
    responder(
      req,
      res,
      await service.alterar(
        id,
        req.admin.id,
        'anotar',
        resultado.data.notasInternas || null,
        resultado.data.versaoNotas,
      ),
    );
  } catch (erro) {
    if (erro.status !== 409) throw erro;
    const atual = await service.buscar(id);
    if (!atual) return res.status(404).json({ erro: 'Envio não encontrado.' });
    res.status(409);
    if (querJson(req)) {
      return res.json({
        erro: erro.message,
        notasDigitadas: resultado.data.notasInternas,
        envio: protegerContato(atual),
      });
    }
    res.render('painel/envios/mostrar', {
      title: `Envio #${id}`,
      envio: protegerContato(atual),
      tipos: TIPOS,
      situacoes: ROTULOS,
      conflitoNotas: erro.message,
      notasDigitadas: resultado.data.notasInternas,
    });
  }
}

function querJson(req) {
  return req.accepts(['html', 'json']) === 'json';
}

function protegerContato(envio) {
  return (
    envio && {
      ...envio,
      emailContato: envio.desejaContato ? envio.emailContato : null,
      versaoNotas: service.versaoNotas(envio),
      versaoSituacao: service.versaoSituacao(envio),
    }
  );
}

function responder(req, res, envio) {
  if (!envio) return res.status(404).json({ erro: 'Envio não encontrado.' });
  if (querJson(req)) return res.json({ envio: protegerContato(envio) });
  req.flash('sucesso', 'Envio atualizado.');
  res.redirect(`/painel/envios/${envio.id}`);
}
