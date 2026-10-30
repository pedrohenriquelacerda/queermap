-- Sprint 5: categorias e paleta de cores
-- Atualiza a categoria legada 'Abrigo / albergue' para 'Abrigo' se ainda tiver o nome antigo
UPDATE "categoria"
SET "nome" = 'Abrigo'
WHERE "slug" = 'abrigo' AND "nome" = 'Abrigo / albergue';

-- 1) valida conflitos explícitos de nome e slug antes de inserir qualquer
--    categoria nova. Quando o nome ou o slug esperado já pertence a outro registro,
--    a transação falha com mensagem clara para revisão sem reclassificar dados
--    arbitrariamente. Categorias existentes e suas customizações são preservadas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "categoria" c
    WHERE c."nome" IN ('Abrigo', 'Albergue', 'Centros POP', 'Casas de Cidadania')
      AND c."slug" NOT IN ('abrigo', 'albergue', 'centro-pop', 'casa-cidadania')
  ) THEN
    RAISE EXCEPTION 'Sprint 5: conflito de nome de categoria detectado para uma categoria de serviço. A migração não altera dados existentes arbitrariamente.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "categoria" c
    WHERE c."slug" IN ('abrigo', 'albergue', 'centro-pop', 'casa-cidadania')
      AND c."nome" NOT IN ('Abrigo', 'Albergue', 'Centros POP', 'Casas de Cidadania')
  ) THEN
    RAISE EXCEPTION 'Sprint 5: conflito de slug de categoria detectado para uma categoria de serviço. A migração não altera dados existentes arbitrariamente.';
  END IF;
END $$;

-- 2) garante que as categorias canônicas existam sem sobrescrever atributos já
--    definidos em uma instalação legacy. A ordem respeita os índices reais do
--    seed: abrigo=3, albergue=4, centro-pop=5, casa-cidadania=6.
INSERT INTO "categoria" ("nome", "slug", "icone", "ordem", "ativa")
VALUES
  ('Abrigo', 'abrigo', 'abrigo', 3, true),
  ('Albergue', 'albergue', 'albergue', 4, true),
  ('Centros POP', 'centro-pop', 'centro-pop', 5, true),
  ('Casas de Cidadania', 'casa-cidadania', 'casa-cidadania', 6, true)
ON CONFLICT ("slug") DO NOTHING;

-- 3) preserva os vínculos do público e dos envios antes de remover a categoria antiga.
--    Se a categoria antiga não existir, a operação é um no-op sem causar erros.
WITH categoria_abrigo AS (
  SELECT id FROM "categoria" WHERE "slug" = 'abrigo'
), categoria_antiga AS (
  SELECT id FROM "categoria" WHERE "slug" = 'casa-acolhimento'
)
UPDATE "local" AS l
SET "categoria_id" = (SELECT id FROM categoria_abrigo)
WHERE EXISTS (
  SELECT 1
  FROM categoria_antiga
  WHERE categoria_antiga.id = l."categoria_id"
);

WITH categoria_abrigo AS (
  SELECT id FROM "categoria" WHERE "slug" = 'abrigo'
), categoria_antiga AS (
  SELECT id FROM "categoria" WHERE "slug" = 'casa-acolhimento'
)
UPDATE "envio" AS e
SET "categoria_sugerida_id" = (SELECT id FROM categoria_abrigo)
WHERE EXISTS (
  SELECT 1
  FROM categoria_antiga
  WHERE categoria_antiga.id = e."categoria_sugerida_id"
);

-- 4) remove a categoria antiga só após migrar todos os vínculos relevantes.
DELETE FROM "categoria"
WHERE "slug" = 'casa-acolhimento';
