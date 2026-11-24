-- As chaves de cor dos tipos de serviço agora têm o nome verdadeiro da cor ou da bandeira.
-- Antes, por exemplo, "abrigo" era a bandeira lésbica e "albergue", a não-binária.
-- Só converte o que já está gravado; valores desconhecidos ficam como estão.
UPDATE "categoria"
SET "icone" = CASE "icone"
    WHEN 'ong' THEN 'arco-iris'
    WHEN 'acolhimento' THEN 'progresso'
    WHEN 'ambulatorio' THEN 'trans'
    WHEN 'abrigo' THEN 'lesbica'
    WHEN 'saude-sexual' THEN 'bissexual'
    WHEN 'casa-cidadania' THEN 'pansexual'
    WHEN 'centro-pop' THEN 'aromantica'
    WHEN 'albergue' THEN 'nao-binaria'
    WHEN 'padrao' THEN 'cor-cinza'
    WHEN 'generoqueer' THEN 'genero-queer'
    WHEN 'cor-ciano' THEN 'cor-azul-claro'
    WHEN 'cor-lima' THEN 'cor-verde-limao'
    WHEN 'cor-agua' THEN 'cor-verde-agua'
    WHEN 'cor-marinho' THEN 'cor-azul-marinho'
    ELSE "icone"
  END
WHERE "icone" IN ('ong', 'acolhimento', 'ambulatorio', 'abrigo', 'saude-sexual', 'casa-cidadania', 'centro-pop', 'albergue', 'padrao', 'generoqueer', 'cor-ciano', 'cor-lima', 'cor-agua', 'cor-marinho');
