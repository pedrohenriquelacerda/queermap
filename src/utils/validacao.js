import { z } from 'zod';

// Valida o corpo do formulário. Retorna { dados } ou { erros: { campo: 'mensagem' } }.
export function validar(esquema, corpo) {
  const resultado = esquema.safeParse(corpo);
  if (resultado.success) return { dados: resultado.data };
  const erros = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path.join('.') || '_';
    erros[campo] ??= issue.message;
  }
  return { erros };
}

// Campos comuns, com mensagens em português.
export const texto = (rotulo, max = 200) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `Use no máximo ${max} caracteres.`);

export const email = () =>
  z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .pipe(z.email('Informe um e-mail válido.'));

// Checkbox HTML: chega "on" quando marcado e não chega quando desmarcado.
export const caixa = () => z.any().transform((v) => v === 'on' || v === 'true' || v === true);

export { z };
