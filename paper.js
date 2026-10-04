// Reiimei papers: lay out a note as an MLA 9 or APA 7 (student) paper, then
// write it as a Word document (.docx) or as printable HTML.
// Both outputs come from the same layout, so they always match.
import { parseNote, inlineToRuns, parseInlineMarkdown, parseInlinePopuli, escapeHtml } from './format.js';
import { makeCiter, referenceList, referenceHeading, formatPaperDate } from './cite.js';
import { zip } from './zip.js';

// Blocks: {k:'para'|'left'|'center'|'heading'|'quote'|'list'|'code'|'ref'|'blank'|'table',
//          runs, bold, level, marker, pageBreak, rows}
const plainRuns = (text, extra = {}) => [{ text, ...extra }];

export function defaultPaper(note) {
  const first = (note.body || '').split('\n').find((l) => l.trim()) || '';
  return {
    title: String(note.meta?.title || '').trim() || first.replace(/^#{1,6}\s+/, '').replace(/[*_#^~+=`]/g, '').trim(),
    date: new Date().toISOString().slice(0, 10),
    mla: { name: '', instructor: '', course: '' },
    apa: { author: '', affiliation: '', course: '', instructor: '' },
  };
}

function bodyBlocks(note, ctx, title) {
  let body = note.body || '';
  // Skip the note's first line when it is the paper title.
  const lines = body.split('\n');
  const firstIdx = lines.findIndex((l) => l.trim());
  if (firstIdx >= 0) {
    const first = lines[firstIdx].replace(/^#{1,6}\s+/, '').replace(/[*_#^~+=`]/g, '').trim();
    if (first && first === title.trim()) body = lines.slice(firstIdx + 1).join('\n');
  }
  const out = [];
  const walk = (blocks, quoted = false) => {
    for (const b of blocks) {
      switch (b.t) {
        case 'h':
          out.push({ k: 'heading', level: Math.min(b.level, 5), runs: inlineToRuns(b.c, ctx) });
          break;
        case 'p':
          for (const line of b.lines) out.push({ k: quoted ? 'quote' : 'para', runs: inlineToRuns(line, ctx) });
          break;
        case 'quote': walk(b.blocks, true); break;
        case 'list': {
          let n = 0;
          for (const it of b.items) {
            const marker = it.task ? (it.checked ? '☑' : '☐') : it.ordered ? `${it.num ?? ++n}.` : '•';
            out.push({ k: 'list', level: it.level, marker, runs: inlineToRuns(it.c, ctx) });
          }
          break;
        }
        case 'code': b.v.split('\n').forEach((l) => out.push({ k: 'code', runs: plainRuns(l, { code: true }) })); break;
        case 'table': out.push({ k: 'table', rows: [b.head, ...b.rows].map((r) => r.map((c) => inlineToRuns(c, ctx))) }); break;
        case 'hr': out.push({ k: 'center', runs: plainRuns('*  *  *') }); break;
        default: break;
      }
    }
  };
  walk(parseNote(body, note.format));
  return out;
}

export function layoutPaper(note) {
  const meta = note.meta || {};
  const style = meta.style === 'mla' ? 'mla' : 'apa';
  const paper = { ...defaultPaper(note), ...(meta.paper || {}) };
  paper.mla = { ...defaultPaper(note).mla, ...(meta.paper?.mla || {}) };
  paper.apa = { ...defaultPaper(note).apa, ...(meta.paper?.apa || {}) };
  const sources = meta.sources || [];
  const citer = makeCiter(sources, style);
  const ctx = { style, cite: (raw) => citer.cite(raw), ncite: (k) => citer.ncite(k) };
  const parseTitle = (t) => inlineToRuns(note.format === 'populi' ? parseInlinePopuli(t) : parseInlineMarkdown(t), ctx);
  const date = formatPaperDate(paper.date, style);
  const blocks = [];
  let headerText = '';

  if (style === 'mla') {
    const name = paper.mla.name.trim();
    headerText = name ? `${name.split(/\s+/).pop()} ` : '';
    for (const line of [name, paper.mla.instructor, paper.mla.course, date]) {
      if (line && line.trim()) blocks.push({ k: 'left', runs: plainRuns(line.trim()) });
    }
    if (paper.title) blocks.push({ k: 'center', runs: parseTitle(paper.title) });
  } else {
    // APA 7 student title page: page number only in the header.
    blocks.push({ k: 'blank' }, { k: 'blank' }, { k: 'blank' });
    blocks.push({ k: 'center', bold: true, runs: parseTitle(paper.title || 'Untitled') });
    blocks.push({ k: 'blank' });
    for (const line of [paper.apa.author, paper.apa.affiliation, paper.apa.course, paper.apa.instructor, date]) {
      if (line && line.trim()) blocks.push({ k: 'center', runs: plainRuns(line.trim()) });
    }
    blocks.push({ k: 'center', bold: true, pageBreak: true, runs: parseTitle(paper.title || 'Untitled') });
  }

  blocks.push(...bodyBlocks(note, ctx, paper.title || ''));

  const refs = referenceList(sources, style);
  if (refs.length) {
    blocks.push({ k: 'center', bold: style === 'apa', pageBreak: true, runs: plainRuns(referenceHeading(style)) });
    for (const r of refs) blocks.push({ k: 'ref', runs: r.runs.map((x) => ({ text: x.text, i: x.italic })) });
  }
  return { style, headerText, blocks, title: paper.title || 'Untitled' };
}

// ---- Word (.docx) --------------------------------------------------------
const xmlEsc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function runXml(r, force = {}) {
  const p = [];
  if (r.code || force.code) p.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
  if (r.b || force.b) p.push('<w:b/>');
  if (r.i || force.i) p.push('<w:i/>');
  if (r.s) p.push('<w:strike/>');
  if (r.u) p.push('<w:u w:val="single"/>');
  if (r.mark) p.push('<w:highlight w:val="yellow"/>');
  if (r.color || force.color) p.push(`<w:color w:val="${r.color || force.color}"/>`);
  if (r.size || force.size) p.push(`<w:sz w:val="${r.size || force.size}"/><w:szCs w:val="${r.size || force.size}"/>`);
  if (r.sup) p.push('<w:vertAlign w:val="superscript"/>');
  else if (r.sub) p.push('<w:vertAlign w:val="subscript"/>');
  const rpr = p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
  return `<w:r>${rpr}<w:t xml:space="preserve">${xmlEsc(r.text)}</w:t></w:r>`;
}

function headingFormat(style, level) {
  // APA 7 heading levels; MLA has no fixed system, so a similar clear scheme is used.
  if (style === 'apa') {
    return [
      null,
      { jc: 'center', b: true },
      { b: true },
      { b: true, i: true },
      { ind: true, b: true, period: true },
      { ind: true, b: true, i: true, period: true },
    ][level];
  }
  return [null, { b: true }, { i: true }, { b: true, i: true }, { i: true }, { i: true }][level];
}

export function paraXml(block, style) {
  const ppr = [];
  let force = {};
  let runs = block.runs || [];
  if (block.pageBreak) ppr.push('<w:pageBreakBefore/>');
  switch (block.k) {
    case 'para': ppr.push('<w:ind w:firstLine="720"/>'); break;
    case 'center': ppr.push('<w:jc w:val="center"/>'); if (block.bold) force.b = true; break;
    case 'heading': {
      const h = headingFormat(style, block.level);
      if (h.jc) ppr.push('<w:jc w:val="center"/>');
      if (h.ind) ppr.push('<w:ind w:firstLine="720"/>');
      ppr.push('<w:keepNext/>');
      force = { b: h.b, i: h.i };
      if (h.period) {
        const t = runs.map((r) => r.text).join('');
        if (!/[.?!]$/.test(t)) runs = [...runs, { text: '.' }];
      }
      break;
    }
    case 'quote': ppr.push('<w:ind w:left="720"/>'); break;
    case 'list': {
      const left = 720 * (block.level + 1) + 360;
      ppr.push(`<w:ind w:left="${left}" w:hanging="360"/>`);
      runs = [{ text: `${block.marker}\t` }, ...runs];
      ppr.push(`<w:tabs><w:tab w:val="left" w:pos="${left}"/></w:tabs>`);
      break;
    }
    case 'code': ppr.push('<w:spacing w:line="240" w:lineRule="auto"/>'); force.code = true; break;
    case 'plain': ppr.push('<w:spacing w:after="120"/>'); break;
    case 'note-title': ppr.push('<w:keepNext/><w:spacing w:before="0" w:after="60"/>'); force = { b: true, size: 32 }; break;
    case 'meta': ppr.push('<w:keepNext/><w:spacing w:after="240"/>'); force = { i: true, size: 20, color: '666666' }; break;
    case 'sub-heading': ppr.push('<w:keepNext/><w:spacing w:before="240" w:after="120"/>'); force = { b: true, size: 26 }; break;
    case 'ref': ppr.push('<w:ind w:left="720" w:hanging="720"/>'); break;
    default: break;
  }
  const pPr = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';
  return `<w:p>${pPr}${runs.map((r) => runXml(r, force)).join('')}</w:p>`;
}

export function tableXml(block) {
  const cols = Math.max(...block.rows.map((r) => r.length));
  const w = Math.floor(9360 / cols);
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
  const rows = block.rows.map((row, ri) => `<w:tr>${Array.from({ length: cols }, (_, ci) => {
    const runs = row[ci] || [];
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>${runs.map((r) => runXml(r, ri === 0 ? { b: true } : {})).join('') || '<w:r><w:t></w:t></w:r>'}</w:p></w:tc>`;
  }).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${w}"/>`.repeat(cols)}</w:tblGrid>${rows}</w:tbl><w:p/>`;
}

export function blocksXml(blocks, style) {
  return blocks.map((b) => {
    if (b.k === 'blank') return '<w:p/>';
    if (b.k === 'table') return tableXml(b);
    return paraXml(b, style);
  }).join('');
}

export function paperToDocx(layout, author = '') {
  return docxPackage({ body: blocksXml(layout.blocks, layout.style), headerText: layout.headerText, title: layout.title, author });
}

// Package body XML as a .docx. line: 480 = double spaced (papers), 276 = 1.15.
export function docxPackage({ body, headerText = '', title = 'Untitled', author = '', line = 480, pageNumbers = true }) {
  const layout = { headerText, title };
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>${layout.headerText ? `<w:r><w:t xml:space="preserve">${xmlEsc(layout.headerText)}</w:t></w:r>` : ''}${pageNumbers ? '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>' : ''}</w:p></w:hdr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(layout.title)}</dc:title><dc:creator>${xmlEsc(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/settings.xml', data: settings },
    { name: 'word/header1.xml', data: header },
    { name: 'docProps/core.xml', data: core },
  ]);
}

// ---- Printable HTML ------------------------------------------------------
function runsHtml(runs, force = {}) {
  return runs.map((r) => {
    let h = escapeHtml(r.text);
    if (r.code) h = `<code>${h}</code>`;
    if (r.sup) h = `<sup>${h}</sup>`;
    else if (r.sub) h = `<sub>${h}</sub>`;
    if (r.mark) h = `<mark>${h}</mark>`;
    if (r.u) h = `<u>${h}</u>`;
    if (r.s) h = `<s>${h}</s>`;
    if (r.i || force.i) h = `<em>${h}</em>`;
    if (r.b || force.b) h = `<strong>${h}</strong>`;
    return h;
  }).join('');
}

export function paperToHtml(layout) {
  return layout.blocks.map((b) => {
    const pb = b.pageBreak ? ' pb' : '';
    switch (b.k) {
      case 'blank': return '<p class="pp blank">&nbsp;</p>';
      case 'para': return `<p class="pp indent${pb}">${runsHtml(b.runs)}</p>`;
      case 'left': return `<p class="pp${pb}">${runsHtml(b.runs)}</p>`;
      case 'center': return `<p class="pp center${pb}">${runsHtml(b.runs, { b: b.bold })}</p>`;
      case 'heading': {
        const h = headingFormat(layout.style, b.level);
        let runs = b.runs;
        if (h.period && !/[.?!]$/.test(runs.map((r) => r.text).join(''))) runs = [...runs, { text: '.' }];
        return `<p class="pp h${h.jc ? ' center' : ''}${h.ind ? ' indent' : ''}${pb}">${runsHtml(runs, { b: h.b, i: h.i })}</p>`;
      }
      case 'quote': return `<p class="pp quote${pb}">${runsHtml(b.runs)}</p>`;
      case 'list': return `<p class="pp list lv${Math.min(b.level, 4)}${pb}"><span class="marker">${escapeHtml(b.marker)}</span>${runsHtml(b.runs)}</p>`;
      case 'code': return `<p class="pp code${pb}">${runsHtml(b.runs)}</p>`;
      case 'ref': return `<p class="pp ref${pb}">${runsHtml(b.runs)}</p>`;
      case 'table': return `<table class="pt">${b.rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${runsHtml(c)}</td>` : `<th>${runsHtml(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
      default: return '';
    }
  }).join('\n');
}

export function safeFileName(title, ext) {
  const base = String(title || 'Untitled').replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
  return `${base}.${ext}`;
}
