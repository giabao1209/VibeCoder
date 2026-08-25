const path = require('path');
const { pathToFileURL } = require('url');
const katex = require('katex');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function stripComments(source) {
  return String(source ?? '')
    .split(/\r?\n/)
    .map((line) => {
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] !== '%') continue;
        let slashes = 0;
        for (let j = i - 1; j >= 0 && line[j] === '\\'; j -= 1) slashes += 1;
        if (slashes % 2 === 0) return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

function slugify(value) {
  const cleaned = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'section';
}

function findBalanced(text, openIndex, openChar = '{', closeChar = '}') {
  if (text[openIndex] !== openChar) return null;
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === openChar && text[i - 1] !== '\\') depth += 1;
    if (text[i] === closeChar && text[i - 1] !== '\\') {
      depth -= 1;
      if (depth === 0) {
        return { content: text.slice(openIndex + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function replaceBracedCommand(input, command, replacer) {
  let text = String(input);
  const needle = `\\${command}`;
  let cursor = 0;
  let output = '';

  while (cursor < text.length) {
    const index = text.indexOf(needle, cursor);
    if (index < 0) {
      output += text.slice(cursor);
      break;
    }

    output += text.slice(cursor, index);
    let argStart = index + needle.length;
    while (/\s/.test(text[argStart] || '')) argStart += 1;
    if (text[argStart] !== '{') {
      output += needle;
      cursor = index + needle.length;
      continue;
    }

    const arg = findBalanced(text, argStart);
    if (!arg) {
      output += text.slice(index);
      break;
    }

    output += replacer(arg.content);
    cursor = arg.end;
  }

  return output;
}

function extractCommand(source, command) {
  const needle = `\\${command}`;
  const index = source.indexOf(needle);
  if (index < 0) return '';
  let argStart = index + needle.length;
  while (/\s/.test(source[argStart] || '')) argStart += 1;
  if (source[argStart] !== '{') return '';
  return findBalanced(source, argStart)?.content?.trim() || '';
}

function safeUrl(url) {
  const value = String(url || '').trim();
  if (/^(https?:|mailto:|#)/i.test(value)) return value;
  return '#';
}

function resolveImage(src, filePath) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (/^(?:https?:|data:|file:)/i.test(value)) return value;
  try {
    return pathToFileURL(path.resolve(path.dirname(filePath), decodeURIComponent(value))).href;
  } catch {
    return value;
  }
}

function renderMath(source, displayMode = false) {
  try {
    return katex.renderToString(source.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'htmlAndMathml'
    });
  } catch (error) {
    return `<span class="latex-error" title="${escapeAttr(error.message)}">${escapeHtml(source)}</span>`;
  }
}

function renderInline(raw, filePath) {
  let text = String(raw ?? '');
  const stash = [];
  const hold = (html) => {
    const token = `\uE000${stash.length}\uE001`;
    stash.push(html);
    return token;
  };

  // Math first so TeX commands inside formulas are never mistaken for text commands.
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math) => hold(renderMath(math, true)));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_match, math) => hold(renderMath(math, true)));
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_match, math) => hold(renderMath(math, false)));
  text = text.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_match, prefix, math) => `${prefix}${hold(renderMath(math, false))}`);

  const richCommands = [
    ['textbf', 'strong'],
    ['textit', 'em'],
    ['emph', 'em'],
    ['underline', 'u'],
    ['texttt', 'code'],
    ['textsc', 'span class="latex-smallcaps"']
  ];

  for (const [command, tag] of richCommands) {
    // Run twice so common nested constructs render without needing a full TeX AST.
    for (let i = 0; i < 2; i += 1) {
      text = replaceBracedCommand(text, command, (content) => hold(`<${tag}>${renderInline(content, filePath)}</${tag.split(' ')[0]}>`));
    }
  }

  // \href{url}{label}
  let hrefCursor = 0;
  let hrefOut = '';
  while (hrefCursor < text.length) {
    const index = text.indexOf('\\href', hrefCursor);
    if (index < 0) {
      hrefOut += text.slice(hrefCursor);
      break;
    }
    hrefOut += text.slice(hrefCursor, index);
    let start = index + 5;
    while (/\s/.test(text[start] || '')) start += 1;
    const urlArg = findBalanced(text, start);
    if (!urlArg) {
      hrefOut += '\\href';
      hrefCursor = index + 5;
      continue;
    }
    start = urlArg.end;
    while (/\s/.test(text[start] || '')) start += 1;
    const labelArg = findBalanced(text, start);
    if (!labelArg) {
      hrefOut += text.slice(index, urlArg.end);
      hrefCursor = urlArg.end;
      continue;
    }
    const url = safeUrl(urlArg.content);
    hrefOut += hold(`<a href="${escapeAttr(url)}">${renderInline(labelArg.content, filePath)}</a>`);
    hrefCursor = labelArg.end;
  }
  text = hrefOut;

  text = replaceBracedCommand(text, 'url', (url) => {
    const safe = safeUrl(url);
    return hold(`<a href="${escapeAttr(safe)}">${escapeHtml(url)}</a>`);
  });

  text = replaceBracedCommand(text, 'footnote', (content) => hold(`<sup class="latex-footnote" title="${escapeAttr(content)}">※</sup>`));
  text = replaceBracedCommand(text, 'label', () => '');
  text = replaceBracedCommand(text, 'ref', (label) => hold(`<span class="latex-ref" title="Reference: ${escapeAttr(label)}">§</span>`));
  text = replaceBracedCommand(text, 'cite', (label) => hold(`<span class="latex-cite">[${escapeHtml(label)}]</span>`));

  // Standalone graphics used inline.
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/g, (_match, src) => {
    const resolved = resolveImage(src, filePath);
    return hold(`<img class="latex-inline-image" src="${escapeAttr(resolved)}" alt="${escapeAttr(path.basename(src))}" />`);
  });

  // Common text-mode symbols and spacing.
  text = text
    .replace(/\\LaTeX\b/g, hold('<span class="latex-logo">L<sup>A</sup>T<sub>E</sub>X</span>'))
    .replace(/\\TeX\b/g, hold('<span class="latex-logo">T<sub>E</sub>X</span>'))
    .replace(/~+/g, '\u00A0')
    .replace(/\\\\/g, hold('<br />'));

  const escapedTokens = new Map([
    ['\\%', '%'], ['\\$', '$'], ['\\&', '&'], ['\\#', '#'], ['\\_', '_'],
    ['\\{', '{'], ['\\}', '}'], ['\\textbackslash', '\\']
  ]);
  for (const [token, value] of escapedTokens) text = text.split(token).join(hold(escapeHtml(value)));

  // Unknown simple formatting switches are ignored rather than shown as noise.
  text = text.replace(/\\(?:noindent|newline|smallskip|medskip|bigskip|centering|raggedright|raggedleft)\b/g, '');

  text = escapeHtml(text);
  text = text.replace(/\uE000(\d+)\uE001/g, (_match, index) => stash[Number(index)] ?? '');
  return text;
}

function renderList(content, ordered, filePath) {
  const items = content
    .split(/\\item(?:\[[^\]]*\])?\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} class="latex-list">${items.map((item) => `<li>${renderInline(item.replace(/\n+/g, ' '), filePath)}</li>`).join('')}</${tag}>`;
}

function renderLatex(source, filePath) {
  const original = String(source ?? '');
  const clean = stripComments(original);
  const documentClass = extractCommand(clean, 'documentclass').toLowerCase();
  const title = extractCommand(clean, 'title');
  const author = extractCommand(clean, 'author');
  const date = extractCommand(clean, 'date');
  const bodyMatch = clean.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/i);
  let body = bodyMatch ? bodyMatch[1] : clean;

  const hasChapter = /\\chapter\*?\s*\{/.test(body) || /\b(book|report)\b/.test(documentClass);
  const usedSlugs = new Map();
  const blockStash = [];
  const holdBlock = (html) => {
    const token = `@@VIBEREADER_BLOCK_${blockStash.length}@@`;
    blockStash.push(html);
    return `\n\n${token}\n\n`;
  };
  const uniqueId = (heading) => {
    const base = slugify(heading);
    const count = usedSlugs.get(base) || 0;
    usedSlugs.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  };

  // Drop preamble directives when a partial/full document gets rendered without begin/end document.
  body = body
    .replace(/\\documentclass(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
    .replace(/\\usepackage(?:\[[^\]]*\])?\{[^{}]*\}/g, '')
    .replace(/\\(?:title|author|date)\{[^{}]*\}/g, '');

  body = body.replace(/\\maketitle\b/g, () => {
    const pieces = [];
    if (title) pieces.push(`<div class="latex-document-title">${renderInline(title, filePath)}</div>`);
    if (author) pieces.push(`<div class="latex-author">${renderInline(author, filePath)}</div>`);
    if (date) pieces.push(`<div class="latex-date">${renderInline(date, filePath)}</div>`);
    return holdBlock(`<header class="latex-title-block">${pieces.join('')}</header>`);
  });

  // Display math environments.
  body = body.replace(/\\begin\{(equation\*?|displaymath|align\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g, (_match, env, math) => {
    let normalized = math.trim();
    if (/^align/.test(env)) normalized = `\\begin{aligned}${normalized}\\end{aligned}`;
    else if (/^gather/.test(env)) normalized = `\\begin{gathered}${normalized}\\end{gathered}`;
    else if (/^multline/.test(env)) normalized = `\\begin{aligned}${normalized}\\end{aligned}`;
    return holdBlock(`<div class="latex-display-math">${renderMath(normalized, true)}</div>`);
  });

  body = body.replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => holdBlock(`<div class="latex-display-math">${renderMath(math, true)}</div>`));
  body = body.replace(/\$\$([\s\S]*?)\$\$/g, (_match, math) => holdBlock(`<div class="latex-display-math">${renderMath(math, true)}</div>`));

  // Figures with local or remote images.
  body = body.replace(/\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/g, (_match, content) => {
    const image = content.match(/\\includegraphics(?:\[([^\]]*)\])?\{([^{}]+)\}/);
    const caption = extractCommand(content, 'caption');
    if (!image) return holdBlock(`<div class="latex-figure-placeholder">${renderInline(content, filePath)}</div>`);
    const src = resolveImage(image[2], filePath);
    return holdBlock(`<figure class="latex-figure"><img src="${escapeAttr(src)}" alt="${escapeAttr(caption || path.basename(image[2]))}" />${caption ? `<figcaption>${renderInline(caption, filePath)}</figcaption>` : ''}</figure>`);
  });

  body = body.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (_match, env, content) => holdBlock(renderList(content, env === 'enumerate', filePath)));
  body = body.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_match, content) => holdBlock(`<section class="latex-abstract"><div class="latex-abstract-title">Abstract</div><p>${renderInline(content.trim().replace(/\n+/g, ' '), filePath)}</p></section>`));
  body = body.replace(/\\begin\{(?:quote|quotation)\}([\s\S]*?)\\end\{(?:quote|quotation)\}/g, (_match, content) => holdBlock(`<blockquote>${renderInline(content.trim().replace(/\n+/g, ' '), filePath)}</blockquote>`));
  body = body.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, (_match, content) => holdBlock(`<div class="latex-center">${renderInline(content.trim().replace(/\n+/g, ' '), filePath)}</div>`));
  body = body.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_match, content) => holdBlock(`<pre class="latex-verbatim"><code>${escapeHtml(content.replace(/^\n|\n$/g, ''))}</code></pre>`));

  const headingMap = hasChapter
    ? { chapter: 1, section: 2, subsection: 3, subsubsection: 4 }
    : { section: 1, subsection: 2, subsubsection: 3 };

  for (const [command, level] of Object.entries(headingMap)) {
    const re = new RegExp(`\\\\${command}\\*?\\s*\\{([^{}]*)\\}`, 'g');
    body = body.replace(re, (_match, heading) => {
      const id = uniqueId(heading);
      return holdBlock(`<h${level} id="${id}">${renderInline(heading, filePath)}</h${level}>`);
    });
  }

  // Standalone graphics outside figure environments.
  body = body.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]+)\}/g, (_match, src) => {
    const resolved = resolveImage(src, filePath);
    return holdBlock(`<figure class="latex-figure"><img src="${escapeAttr(resolved)}" alt="${escapeAttr(path.basename(src))}" /></figure>`);
  });

  // Remove a few structural commands that do not have a useful reader equivalent.
  body = body
    .replace(/\\(?:tableofcontents|clearpage|newpage|pagebreak|vfill|hfill)\b/g, '\n\n')
    .replace(/\\(?:bibliographystyle|bibliography)\{[^{}]*\}/g, '')
    .replace(/\\setlength\{[^{}]*\}\{[^{}]*\}/g, '')
    .replace(/\\newcommand\*?(?:\[[^\]]*\])?\{[^{}]*\}(?:\[[^\]]*\])?\{[^{}]*\}/g, '');

  const html = body
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const blockMatch = chunk.match(/^@@VIBEREADER_BLOCK_(\d+)@@$/);
      if (blockMatch) return blockStash[Number(blockMatch[1])] || '';
      return `<p>${renderInline(chunk.replace(/\n+/g, ' '), filePath)}</p>`;
    })
    .join('\n');

  const fallbackTitle = path.basename(filePath || 'document.tex').replace(/\.tex$/i, '');
  const intro = !/\<h1\b/i.test(html) && title
    ? `<h1 id="${uniqueId(title)}">${renderInline(title, filePath)}</h1>`
    : '';

  return {
    html: `${intro}${html || `<p class="empty-document-note">${escapeHtml(fallbackTitle)} hiện chưa có nội dung.</p>`}`,
    title: title || fallbackTitle,
    format: 'latex'
  };
}

module.exports = { renderLatex };
