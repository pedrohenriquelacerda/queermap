CREATE TABLE "avaliacao" (
    "id" SERIAL NOT NULL,
    "local_id" INTEGER NOT NULL,
    "nota" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "avaliacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "avaliacao_nota_valida" CHECK ("nota" BETWEEN 1 AND 5)
);

CREATE INDEX "avaliacao_local_id_idx" ON "avaliacao"("local_id");
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
