// Verificações do pre-commit (.husky/pre-commit), só nos arquivos do commit.
// As mesmas do CI (.github/workflows/ci.yml); a checagem de migrations fica só no CI.
export default {
  // Formata e já inclui a correção no commit.
  '*': 'prettier --write --ignore-unknown',
  '*.js': 'eslint --max-warnings 0',
  // Função: valida o schema inteiro, sem passar a lista de arquivos ao comando.
  'prisma/schema.prisma': () => 'prisma validate',
};
