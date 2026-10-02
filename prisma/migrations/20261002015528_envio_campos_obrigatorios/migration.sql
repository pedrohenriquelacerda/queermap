-- AlterTable
ALTER TABLE "envio" ADD COLUMN     "categoria_sugerida_id" INTEGER,
ADD COLUMN     "contato_local_sugerido" TEXT,
ADD COLUMN     "nome_local_relato" TEXT;

-- AddForeignKey
ALTER TABLE "envio" ADD CONSTRAINT "envio_categoria_sugerida_id_fkey" FOREIGN KEY ("categoria_sugerida_id") REFERENCES "categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
