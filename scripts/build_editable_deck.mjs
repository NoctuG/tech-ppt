#!/usr/bin/env node
// Declarative starter for native text/shapes + separately embedded illustrations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length < 2) {
  console.log('Usage: node build_editable_deck.mjs plan.json private-build-dir [--module-root <runtime-node_modules>]');
  process.exit(args.includes('--help') ? 0 : 2);
}
const input = path.resolve(args[0]);
const build = path.resolve(args[1]);
const moduleIndex = args.indexOf('--module-root');
const require = createRequire(moduleIndex >= 0 ? path.join(path.resolve(args[moduleIndex + 1]), '.courseware-loader.cjs') : import.meta.url);
const { Presentation, PresentationFile } = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const plan = JSON.parse((await fs.readFile(input, 'utf8')).replace(/^\uFEFF/, ''));
const base = path.dirname(input);
const canvas = plan.canvas ?? { width: 1280, height: 720 };
if (!Array.isArray(plan.slides) || !plan.slides.length) throw new Error('plan.slides must contain at least one slide.');
await fs.mkdir(build, { recursive: true });
const candidate = path.join(build, 'candidate.pptx');
try { await fs.access(candidate); throw new Error('Output already exists; choose a new build directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const presentation = Presentation.create({ slideSize: canvas });
presentation.theme.defaultFont = plan.font ?? 'Microsoft YaHei';
const imageMap = [];
for (const [i, page] of plan.slides.entries()) {
  const slide = presentation.slides.add();
  slide.background.fill = page.background ?? '#FFFFFF';
  if (!page.elements?.some(e => e.type === 'text' && e.text?.trim())) throw new Error(`Slide ${i + 1} has no editable text.`);
  const seen = new Set();
  for (const [j, element] of page.elements.entries()) {
    const name = element.name ?? `page-${i + 1}-${element.type}-${j + 1}`;
    if (seen.has(name)) throw new Error(`Duplicate object name: ${name}`);
    seen.add(name);
    const { x, y, w, h } = element;
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > canvas.width + 1 || y + h > canvas.height + 1) {
      throw new Error(`Invalid or out-of-bounds element ${name}`);
    }
    const position = { left: x, top: y, width: w, height: h, ...(element.rotation ? { rotation: element.rotation } : {}) };
    if (element.type === 'image') {
      const filename = path.resolve(base, element.path);
      const ext = path.extname(filename).toLowerCase();
      const contentType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[ext];
      if (!contentType) throw new Error(`Unsupported image type: ${ext}`);
      const bytes = await fs.readFile(filename);
      slide.images.add({ blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType, alt: element.alt ?? name, fit: element.fit ?? 'contain', position });
      imageMap.push({ slide: i + 1, logicalName: name, path: element.path, frame: position });
    } else if (element.type === 'text' || element.type === 'shape') {
      const shape = slide.shapes.add({ name, geometry: element.type === 'text' ? 'textbox' : (element.geometry ?? 'roundRect'), position,
        fill: element.fill ?? 'none',
        line: { fill: element.lineColor ?? 'none', width: element.lineWidth ?? 0, style: 'solid' },
        ...(element.radius !== undefined ? { borderRadius: element.radius } : {}) });
      if (element.type === 'text') {
        if (typeof element.text !== 'string') throw new Error(`Missing text: ${name}`);
        shape.text = element.text;
        shape.text.insets = element.padding ?? 0;
        shape.text.style = { typeface: element.font ?? plan.font ?? 'Microsoft YaHei', fontSize: element.fontSize ?? 30,
          color: element.color ?? '#111111', bold: element.bold ?? false, alignment: element.align ?? 'left' };
      }
    } else throw new Error(`Unsupported element type: ${element.type}`);
  }
  if (page.notes) slide.speakerNotes.text = page.notes;
}
await (await PresentationFile.exportPptx(presentation)).save(candidate);
await fs.writeFile(path.join(build, 'image-map.json'), JSON.stringify(imageMap, null, 2));
for (const [i, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(build, `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({ candidate, slides: presentation.slides.items.length, previewDirectory: build }));
