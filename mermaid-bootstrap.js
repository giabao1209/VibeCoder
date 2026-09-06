import mermaid from './node_modules/mermaid/dist/mermaid.esm.min.mjs';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral',
  flowchart: { useMaxWidth: true, htmlLabels: false },
  sequence: { useMaxWidth: true },
  class: { useMaxWidth: true },
  state: { useMaxWidth: true },
  er: { useMaxWidth: true }
});

let diagramCounter = 0;
let renderChain = Promise.resolve();

function diagramErrorMessage(error) {
  const raw = error?.message || String(error || 'Unknown Mermaid rendering error');
  return raw.split('\n')[0].trim();
}

async function renderDiagram(node) {
  if (!node?.isConnected || node.dataset.vibereaderMermaid !== 'queued') return;

  node.dataset.vibereaderMermaid = 'rendering';
  const source = node.textContent || '';
  const id = `vibereader-mermaid-${Date.now()}-${++diagramCounter}`;

  try {
    const { svg, bindFunctions } = await mermaid.render(id, source);
    if (!node.isConnected) return;

    const diagram = document.createElement('div');
    diagram.className = 'mermaid-diagram';
    diagram.setAttribute('role', 'img');
    diagram.setAttribute('aria-label', 'Mermaid diagram');
    diagram.innerHTML = svg;
    node.replaceWith(diagram);
    bindFunctions?.(diagram);
  } catch (error) {
    if (!node.isConnected) return;
    node.dataset.vibereaderMermaid = 'error';
    node.classList.add('mermaid-source-error');

    const message = document.createElement('div');
    message.className = 'mermaid-error-message';
    message.textContent = `Không render được Mermaid: ${diagramErrorMessage(error)}`;
    node.insertAdjacentElement('beforebegin', message);
    console.error('[VibeReader] Mermaid render failed:', error);
  }
}

function enqueueDiagram(node) {
  if (!(node instanceof HTMLElement)) return;
  if (node.dataset.vibereaderMermaid !== 'pending') return;

  node.dataset.vibereaderMermaid = 'queued';
  renderChain = renderChain
    .then(() => renderDiagram(node))
    .catch((error) => console.error('[VibeReader] Mermaid queue failed:', error));
}

function scanForDiagrams(root = document) {
  if (root instanceof HTMLElement && root.matches('[data-vibereader-mermaid="pending"]')) {
    enqueueDiagram(root);
  }

  root.querySelectorAll?.('[data-vibereader-mermaid="pending"]').forEach(enqueueDiagram);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) scanForDiagrams(node);
    }
  }
});

function start() {
  scanForDiagrams(document);
  observer.observe(document.body, { childList: true, subtree: true });
  window.__vibeMermaidReady = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
