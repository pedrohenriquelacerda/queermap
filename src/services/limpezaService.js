import { prisma } from '../db/prisma.js';
import { JANELA_DIAS } from './enviosService.js';

// Limpeza de privacidade: o que a página de Privacidade promete apagar.
//
//  - VerificacaoEmail (hash do e-mail e do código): o código vale 15 min, então depois disso a
//    linha não serve para nada. Guardamos 1 h só de margem.
//  - RegistroEnvio (hash do e-mail que limita 5 envios a cada 30 dias): sai quando a janela acaba.
//
// Não apaga Envio, LogAuditoria nem Admin: o prazo de guarda deles depende de decisão da ONG
// (veja docs/PRIVACIDADE.md).

export const RETENCAO_VERIFICACAO_HORAS = 1;

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Apaga tudo que passou do prazo. Pode rodar quantas vezes quiser: só remove o que já venceu.
export async function limparDadosVencidos(agora = new Date()) {
  const [verificacoes, registros] = await prisma.$transaction([
    prisma.verificacaoEmail.deleteMany({
      where: { criadoEm: { lt: new Date(agora.getTime() - RETENCAO_VERIFICACAO_HORAS * HORA) } },
    }),
    prisma.registroEnvio.deleteMany({
      where: { criadoEm: { lt: new Date(agora.getTime() - JANELA_DIAS * DIA) } },
    }),
  ]);
  return { verificacoes: verificacoes.count, registros: registros.count };
}

// Roda a limpeza ao iniciar e depois a cada `intervaloHoras`. Devolve a função que para o agendamento.
// Ao iniciar também, porque no plano gratuito do Render o servidor dorme sem tráfego e um
// temporizador sozinho nunca chegaria a disparar.
export function agendarLimpeza({ intervaloHoras = 6 } = {}) {
  const executar = async () => {
    try {
      const { verificacoes, registros } = await limparDadosVencidos();
      console.info(
        `Limpeza de privacidade: ${verificacoes} código(s) e ${registros} registro(s) de limite apagados.`,
      );
    } catch (erro) {
      // Só o código do erro: a mensagem do banco pode trazer dados da consulta.
      console.error(`Limpeza de privacidade falhou (${erro.code ?? erro.name}).`);
    }
  };

  executar();
  const temporizador = setInterval(executar, intervaloHoras * HORA);
  temporizador.unref(); // não impede o processo de encerrar
  return () => clearInterval(temporizador);
}
