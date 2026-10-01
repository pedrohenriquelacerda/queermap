import { env } from '../config/env.js';
import * as envios from '../services/enviosService.js';
import { enviarEmail } from '../services/emailService.js';
import { verificarHumano } from '../services/turnstileService.js';
import { analisar } from '../utils/filtroConteudo.js';
import { hashEmail, mascararEmail } from '../utils/hash.js';
import { validar, email, caixa, textoOpcional, z } from '../utils/validacao.js';

export const TIPOS = {
  SUGESTAO_LOCAL: { rotulo: 'Sugerir um local', ajuda: 'Um serviço que deveria estar no mapa.' },
  ELOGIO: { rotulo: 'Elogio', ajuda: 'Um atendimento que foi bom.' },
  RECLAMACAO: { rotulo: 'Reclamação', ajuda: 'Um problema no atendimento ou informação errada.' },
  DISCRIMINACAO: { rotulo: 'Discriminação', ajuda: 'Você sofreu preconceito ou violência.' },
};

const esquema = z
  .object({
    tipo: z.enum(Object.keys(TIPOS), { error: 'Escolha o que você quer enviar.' }),
    localId: z
      .string()
      .optional()
      .transform((v) => (/^\d+$/.test(v ?? '') ? Number(v) : null)),
    nomeLocalSugerido: textoOpcional(150),
    enderecoLocalSugerido: textoOpcional(300),
    mensagem: z
      .string({ error: 'Escreva sua mensagem.' })
      .trim()
      .min(10, 'Escreva pelo menos 10 caracteres.')
      .max(2000, 'Use no máximo 2.000 caracteres.'),
    email: email(),
    desejaContato: caixa(),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === 'SUGESTAO_LOCAL' && !d.nomeLocalSugerido) {
      ctx.addIssue({
        code: 'custom',
        path: ['nomeLocalSugerido'],
        message: 'Informe o nome do local sugerido.',
      });
    }
  });

const MENSAGENS_CODIGO = {
  incorreto: 'Código incorreto. Confira o e-mail e tente de novo.',
  expirado: 'O código expirou. Volte e envie de novo para receber um código novo.',
  tentativas:
    'Muitas tentativas com código errado. Volte e envie de novo para receber outro código.',
  invalido: 'Este código não vale mais. Volte e envie de novo.',
};

// ─── Passo 1: formulário ────────────────────────────────────────────────────

export async function formulario(req, res) {
  const locais = await envios.locaisParaSelecao();
  const pendente = req.session.envioPendente?.dados ?? {};
  const doLocal = locais.find((l) => l.slug === req.query.local);
  const valores = {
    tipo: doLocal ? 'RECLAMACAO' : '',
    ...pendente,
    localId: doLocal?.id ?? pendente.localId ?? '',
  };
  renderizar(res, { valores, locais });
}

export async function enviar(req, res) {
  const locais = await envios.locaisParaSelecao();
  const { dados, erros } = validar(esquema, req.body);
  const valores = { ...req.body, email: '' }; // nunca reexibe o e-mail
  if (erros) return renderizar(res.status(400), { valores, locais, erros });

  if (dados.localId && !locais.some((l) => l.id === dados.localId)) dados.localId = null;
  if (!(await verificarHumano(req.body['cf-turnstile-response'], req.ip))) {
    return renderizar(res.status(400), {
      valores,
      locais,
      erroGeral: 'Não conseguimos confirmar que você não é um robô. Tente de novo.',
    });
  }

  const emailHash = hashEmail(dados.email);
  if (await envios.atingiuLimite(emailHash)) {
    return renderizar(res.status(429), {
      valores,
      locais,
      erroGeral: `Este e-mail já fez ${envios.LIMITE_ENVIOS} envios nos últimos ${envios.JANELA_DIAS} dias. Tente de novo mais tarde.`,
    });
  }

  const ehSugestao = dados.tipo === 'SUGESTAO_LOCAL';
  const { verificacaoId, codigo } = await envios.criarVerificacao(emailHash);
  await enviarEmail({
    para: dados.email,
    assunto: `Seu código de confirmação: ${codigo}`,
    texto: [
      `Seu código para confirmar o envio ao Mapa SerQueer é: ${codigo}`,
      '',
      `Ele vale por ${envios.VALIDADE_CODIGO_MIN} minutos.`,
      'Se não foi você, ignore este e-mail.',
    ].join('\n'),
  });

  // Na sessão: os dados do envio e o hash do e-mail. O endereço só fica se a pessoa
  // pediu contato (porque aí ele será salvo junto com o envio).
  req.session.envioPendente = {
    verificacaoId,
    emailHash,
    emailMascarado: mascararEmail(dados.email),
    dados: {
      tipo: dados.tipo,
      localId: ehSugestao ? null : dados.localId,
      nomeLocalSugerido: ehSugestao ? dados.nomeLocalSugerido : null,
      enderecoLocalSugerido: ehSugestao ? dados.enderecoLocalSugerido : null,
      mensagem: dados.mensagem,
      desejaContato: dados.desejaContato,
      emailContato: dados.desejaContato ? dados.email : null,
    },
  };
  res.redirect('/enviar/confirmar');
}

// ─── Passo 2: código ────────────────────────────────────────────────────────

export function formularioCodigo(req, res) {
  const pendente = req.session.envioPendente;
  if (!pendente) return res.redirect('/enviar');
  renderizarCodigo(res, pendente);
}

export async function confirmar(req, res) {
  const pendente = req.session.envioPendente;
  if (!pendente) return res.redirect('/enviar');

  const codigo = String(req.body.codigo ?? '').replace(/\D/g, '');
  if (codigo.length !== 6) {
    return renderizarCodigo(res.status(400), pendente, 'O código tem 6 números.');
  }

  const erro = await envios.conferirCodigo(pendente.verificacaoId, pendente.emailHash, codigo);
  if (erro) return renderizarCodigo(res.status(400), pendente, MENSAGENS_CODIGO[erro]);

  if (await envios.atingiuLimite(pendente.emailHash)) {
    delete req.session.envioPendente;
    return res.redirect('/enviar');
  }

  const { dados } = pendente;
  const filtro = analisar(
    [dados.nomeLocalSugerido, dados.enderecoLocalSugerido, dados.mensagem]
      .filter(Boolean)
      .join('\n'),
  );
  await envios.registrar({ ...dados, ...filtro }, pendente.emailHash);

  delete req.session.envioPendente;
  req.session.envioConcluido = dados.tipo;
  res.redirect('/enviar/obrigado');
}

export function obrigado(req, res) {
  const tipo = req.session.envioConcluido;
  if (!tipo) return res.redirect('/');
  delete req.session.envioConcluido;
  res.render('envios/obrigado', { title: 'Envio recebido', tipo });
}

function renderizar(res, { valores, locais, erros = {}, erroGeral = null }) {
  res.render('envios/form', {
    title: 'Enviar sugestão ou relato',
    descricao: 'Sugira um local para o mapa ou conte à ONG Somos como foi um atendimento.',
    tipos: TIPOS,
    valores,
    locais,
    erros,
    erroGeral,
    turnstileSiteKey: env.turnstile.siteKey,
    scripts: ['/js/envio.js'],
  });
}

function renderizarCodigo(res, pendente, erro = null) {
  res.render('envios/codigo', {
    title: 'Confirme seu e-mail',
    emailMascarado: pendente.emailMascarado,
    validade: envios.VALIDADE_CODIGO_MIN,
    erro,
  });
}
