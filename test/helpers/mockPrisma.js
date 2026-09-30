import { mock } from 'node:test';

const originais = [];

// Os métodos do Prisma vêm de um Proxy, então mock.method() não os reconhece.
// Aqui substituímos direto e guardamos o original para restaurar depois.
export function mockPrisma(delegate, metodo, implementacao) {
  originais.push([delegate, metodo, delegate[metodo]]);
  const fn = mock.fn(implementacao);
  delegate[metodo] = fn;
  return fn;
}

export function restaurarPrisma() {
  for (const [delegate, metodo, original] of originais.splice(0).reverse()) {
    delegate[metodo] = original;
  }
}
