const assert = require('assert');
const { renderMarkdown, looksLikeMermaid } = require('./markdown-renderer');

const implicitClassDiagram = `\`\`\`
classDiagram
    AActor <|-- AController
    AController <|-- APlayerController
    AController <|-- AAIController
    APlayerController <|-- AVaultPlayerController
    APlayerController <|-- AMainMenuPlayerController
    AAIController <|-- AVaultAIController
\`\`\``;

const explicitMermaid = `\`\`\`mermaid
flowchart LR
    A --> B
\`\`\``;

const regularCode = `\`\`\`cpp
classDiagram = false;
\`\`\``;

assert.equal(looksLikeMermaid('classDiagram\nA <|-- B'), true, 'classDiagram should auto-detect');
assert.equal(looksLikeMermaid('flowchart TD\nA --> B'), true, 'flowchart should auto-detect');
assert.equal(looksLikeMermaid('const graph = {};'), false, 'ordinary source must not auto-detect');

const implicitHtml = renderMarkdown(implicitClassDiagram, 'example.md').html;
assert.match(implicitHtml, /data-vibereader-mermaid="pending"/, 'unlabelled classDiagram fence should become Mermaid');
assert.match(implicitHtml, /AActor &lt;\|-- AController/, 'Mermaid source must stay HTML-escaped');

const explicitHtml = renderMarkdown(explicitMermaid, 'example.md').html;
assert.match(explicitHtml, /data-vibereader-mermaid="pending"/, 'explicit mermaid fence should become Mermaid');

const codeHtml = renderMarkdown(regularCode, 'example.md').html;
assert.doesNotMatch(codeHtml, /data-vibereader-mermaid=/, 'language-labelled source code must remain code');
assert.match(codeHtml, /classDiagram/, 'ordinary code content should remain visible');

console.log('Mermaid renderer regression tests passed.');
