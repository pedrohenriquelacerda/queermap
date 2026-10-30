// Reordenação de categorias por arrastar e soltar (Drag and drop).
// Sem JavaScript, os botões ▲ e ▼ funcionam normalmente via requisições POST tradicionais.

const tabela = document.getElementById('tabela-categorias');

if (tabela) {
  const tbody = tabela.querySelector('tbody');
  let linhaArrastada = null;

  function atualizarBotoes() {
    const linhas = Array.from(tbody.querySelectorAll('tr.linha-arrastavel'));
    linhas.forEach((tr, idx) => {
      const btnSubir = tr.querySelector('button[title="Mover para cima"]');
      const btnDescer = tr.querySelector('button[title="Mover para baixo"]');
      if (btnSubir) btnSubir.disabled = idx === 0;
      if (btnDescer) btnDescer.disabled = idx === linhas.length - 1;
    });
  }

  async function salvarNovaOrdem() {
    const linhas = Array.from(tbody.querySelectorAll('tr.linha-arrastavel'));
    const ids = linhas.map((tr) => Number(tr.dataset.id)).filter(Boolean);

    try {
      const res = await fetch('/painel/classificacao/categoria/reordenar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ordem: ids }),
      });

      if (!res.ok) {
        console.error('Falha ao salvar ordem:', await res.text());
      }
    } catch (err) {
      console.error('Erro de conexão ao salvar ordem das categorias:', err);
    }
  }

  tbody.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr.linha-arrastavel');
    if (!tr) return;
    linhaArrastada = tr;
    tr.classList.add('arrastando');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tr.dataset.id);
  });

  tbody.addEventListener('dragend', (e) => {
    const tr = e.target.closest('tr.linha-arrastavel');
    if (tr) tr.classList.remove('arrastando');
    tbody.querySelectorAll('.alvo-arrasto').forEach((el) => el.classList.remove('alvo-arrasto'));
    linhaArrastada = null;
  });

  tbody.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.target.closest('tr.linha-arrastavel');
    if (!tr || tr === linhaArrastada) return;

    tbody.querySelectorAll('.alvo-arrasto').forEach((el) => {
      if (el !== tr) el.classList.remove('alvo-arrasto');
    });
    tr.classList.add('alvo-arrasto');
  });

  tbody.addEventListener('dragleave', (e) => {
    const tr = e.target.closest('tr.linha-arrastavel');
    if (tr && !tr.contains(e.relatedTarget)) {
      tr.classList.remove('alvo-arrasto');
    }
  });

  tbody.addEventListener('drop', async (e) => {
    e.preventDefault();
    const trAlvo = e.target.closest('tr.linha-arrastavel');
    tbody.querySelectorAll('.alvo-arrasto').forEach((el) => el.classList.remove('alvo-arrasto'));

    if (!trAlvo || !linhaArrastada || trAlvo === linhaArrastada) return;

    const linhas = Array.from(tbody.querySelectorAll('tr.linha-arrastavel'));
    const indiceOrigem = linhas.indexOf(linhaArrastada);
    const indiceAlvo = linhas.indexOf(trAlvo);

    if (indiceOrigem < indiceAlvo) {
      tbody.insertBefore(linhaArrastada, trAlvo.nextSibling);
    } else {
      tbody.insertBefore(linhaArrastada, trAlvo);
    }

    atualizarBotoes();
    await salvarNovaOrdem();
  });
}
