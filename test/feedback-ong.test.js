// Ajustes pedidos pela ONG na revisão da demonstração: busca por endereço, contatos à vista.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { variantesDaConsulta } from '../src/services/geocodificacaoService.js';
import { linkWhatsapp, siteLegivel, textoBusca } from '../src/utils/formatadores.js';
import { mockPrisma, restaurarPrisma } from './helpers/mockPrisma.js';

const app = createApp();

function local(extra = {}) {
  return {
    id: 1,
    nome: 'Ambulatório Teste',
    slug: 'ambulatorio-teste',
    descricao: null,
    logradouro: 'Avenida Ipiranga',
    numero: '6681',
    complemento: null,
    bairro: 'Partenon',
    cidade: 'Porto Alegre',
    uf: 'RS',
    cep: '90619-900',
    latitude: -30.03,
    longitude: -51.23,
    telefone: '(51) 3333-4444',
    whatsapp: '(51) 98888-7777',
    email: 'contato@ambulatorio.test',
    site: 'https://www.ambulatorio.test/',
    horarioFuncionamento: null,
    atualizadoEm: new Date('2026-09-30T12:00:00Z'),
    categoria: { nome: 'Ambulatório trans', slug: 'ambulatorio-trans', icone: 'ambulatorio' },
    caracteristicas: [{ nome: 'Oferece PrEP', slug: 'oferece-prep' }],
    ...extra,
  };
}

beforeEach(() => {
  mockPrisma(prisma.categoria, 'findMany', async () => [
    { nome: 'Ambulatório trans', slug: 'ambulatorio-trans', icone: 'ambulatorio', ordem: 0 },
  ]);
});
afterEach(() => {
  restaurarPrisma();
  mock.restoreAll();
});

// ─── Busca da lista ─────────────────────────────────────────────────────────

test('busca da lista procura também no endereço, com e sem abreviação, e no CEP', () => {
  const texto = textoBusca(local());
  for (const termo of [
    'avenida',
    'av',
    'ipiranga',
    '6681',
    'partenon',
    '90619',
    '900',
    '90619900',
  ]) {
    assert.ok(
      texto.split(' ').some((p) => p.includes(termo)),
      `não achou "${termo}"`,
    );
  }
  assert.doesNotMatch(texto, /[^a-z0-9 ]/); // sem acentos nem pontuação
});

test('GET / usa o endereço na busca e oferece procurar o texto como endereço', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);
  const res = await request(app).get('/');
  assert.match(res.text, /data-busca="[^"]*ipiranga 6681[^"]*"/);
  assert.match(res.text, /placeholder="Buscar por nome, endereço, bairro ou serviço"/);
  assert.match(res.text, /<button[^>]*id="buscar-como-endereco"[^>]*hidden/);
});

// ─── Contatos à vista ───────────────────────────────────────────────────────

test('página do local mostra os contatos escritos, não só em botões', async () => {
  mockPrisma(prisma.local, 'findFirst', async () => local());
  const res = await request(app).get('/locais/ambulatorio-teste');
  assert.match(res.text, /<a href="tel:5133334444">\(51\) 3333-4444<\/a>/);
  assert.match(res.text, /href="https:\/\/wa\.me\/5551988887777"[^>]*>\(51\) 98888-7777<\/a>/);
  assert.match(res.text, /href="mailto:contato@ambulatorio\.test">contato@ambulatorio\.test<\/a>/);
  assert.match(res.text, />ambulatorio\.test<\/a>/);
});

test('lista e popup do mapa trazem telefone e WhatsApp do local', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local()]);
  const res = await request(app).get('/');
  const [cartao] = res.text.match(
    /<li\s+class="cartao-local"[\s\S]*?<\/li>\s*<\/ul>|<li\s+class="cartao-local"[\s\S]*?Ver no mapa/,
  );
  assert.match(cartao, /href="tel:5133334444"/);
  assert.match(cartao, /href="https:\/\/wa\.me\/5551988887777"/);

  const dados = JSON.parse(res.text.match(/id="dados-mapa">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(dados[0].telefone, { texto: '(51) 3333-4444', link: 'tel:5133334444' });
  assert.equal(dados[0].whatsapp, 'https://wa.me/5551988887777');
});

test('local sem telefone nem WhatsApp não mostra a linha de contato', async () => {
  mockPrisma(prisma.local, 'findMany', async () => [local({ telefone: null, whatsapp: '' })]);
  const res = await request(app).get('/');
  assert.doesNotMatch(res.text, /class="contato-curto"/);
  const dados = JSON.parse(res.text.match(/id="dados-mapa">([\s\S]*?)<\/script>/)[1]);
  assert.equal(dados[0].telefone, null);
  assert.equal(dados[0].whatsapp, null);
});

test('link do WhatsApp entende DDD 55 e números com o código do país', () => {
  assert.equal(linkWhatsapp('(51) 98888-7777'), 'https://wa.me/5551988887777');
  assert.equal(linkWhatsapp('(55) 99999-0000'), 'https://wa.me/5555999990000'); // Santa Maria
  assert.equal(linkWhatsapp('+55 55 99999-0000'), 'https://wa.me/5555999990000');
  assert.equal(linkWhatsapp('55 3222-1111'), 'https://wa.me/555532221111'); // fixo de Santa Maria
  assert.equal(linkWhatsapp('051 98888-7777'), 'https://wa.me/5551988887777');
  assert.equal(linkWhatsapp('123'), null);
  assert.equal(linkWhatsapp(null), null);
});

test('site aparece sem protocolo nem "www"', () => {
  assert.equal(siteLegivel('https://www.somos.org.br/'), 'somos.org.br');
  assert.equal(siteLegivel('http://exemplo.org/contato'), 'exemplo.org/contato');
});

// ─── Busca de endereço (Nominatim) ──────────────────────────────────────────

test('variações da busca de endereço: abreviações, cidade e sem número', () => {
  const opcoes = { cidadePadrao: 'Porto Alegre' };
  assert.deepEqual(variantesDaConsulta('Av. Ipiranga, 6681', opcoes), [
    'Av. Ipiranga, 6681',
    'Avenida Ipiranga, 6681, Porto Alegre',
    'Avenida Ipiranga, Porto Alegre',
  ]);
  assert.deepEqual(variantesDaConsulta('R. da República 500', opcoes), [
    'R. da República 500',
    'Rua da República 500, Porto Alegre',
    'Rua da República, Porto Alegre',
  ]);
  // Já cita a cidade: não repete.
  assert.deepEqual(variantesDaConsulta('Rua Sarmento Leite, 245, porto alegre', opcoes), [
    'Rua Sarmento Leite, 245, porto alegre',
    'Rua Sarmento Leite, porto alegre',
  ]);
  // Sem cidade padrão (painel): só abreviações e número.
  assert.deepEqual(variantesDaConsulta('Cidade Baixa'), ['Cidade Baixa']);
});

test('GET /buscar-endereco tenta variações quando a primeira busca não acha nada', async () => {
  const consultas = [];
  mock.method(globalThis, 'fetch', async (url) => {
    const q = new URL(url).searchParams.get('q');
    consultas.push(q);
    const achou = q === 'Avenida Ipiranga, 6681, Porto Alegre';
    return Response.json(
      achou ? [{ lat: '-30.05', lon: '-51.17', display_name: 'Avenida Ipiranga, 6681' }] : [],
    );
  });

  const res = await request(app).get('/buscar-endereco?q=Av.%20Ipiranga%2C%206681');
  assert.equal(res.status, 200);
  assert.equal(res.body.resultados.length, 1);
  assert.deepEqual(consultas, ['Av. Ipiranga, 6681', 'Avenida Ipiranga, 6681, Porto Alegre']);
});

test('GET /buscar-endereco faz no máximo 3 consultas e responde vazio', async () => {
  let consultas = 0;
  mock.method(globalThis, 'fetch', async () => {
    consultas++;
    return Response.json([]);
  });
  const res = await request(app).get('/buscar-endereco?q=Rua%20Inexistente%20123');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.resultados, []);
  assert.equal(consultas, 3);
});
