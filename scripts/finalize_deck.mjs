#!/usr/bin/env node
// Use the installed Presentations skill's validators, then render the actual final PPTX.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
if (args.includes('--help') || args.length !== 8) {
  console.log('Usage: node finalize_deck.mjs plan.json candidate.pptx final.pptx workspace-dir presentations-skill-dir runtime-python runtime-node_modules private-report-dir');
  process.exit(args.includes('--help') ? 0 : 2);
}
const [manifest, candidatePath, finalPath, workspaceDir, presentationSkill, pythonExecutable, nodeModules, reportDir] = args.map(p => path.resolve(p));
const finalDirectory = path.dirname(finalPath);
const relativeReport = path.relative(finalDirectory, reportDir);
if (!relativeReport || (!relativeReport.startsWith('..' + path.sep) && relativeReport !== '..' && !path.isAbsolute(relativeReport))) {
  throw new Error('Keep private report directory outside the final output directory.');
}
process.env.RUNTIME_NODE_MODULES = nodeModules;
process.env.RUNTIME_NODE = process.execPath;
const plan = JSON.parse((await fs.readFile(manifest, 'utf8')).replace(/^\uFEFF/, ''));
const families = [...new Set([plan.font ?? 'Microsoft YaHei', ...plan.slides.flatMap(s => s.elements.filter(e => e.type === 'text').map(e => e.font ?? plan.font ?? 'Microsoft YaHei'))])];
const { finalizePresentation } = await import(pathToFileURL(path.join(presentationSkill, 'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(reportDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });
const { width = 1280, height = 720 } = plan.canvas ?? {};
await finalizePresentation({ workspaceDir, candidatePath, finalPath, pythonExecutable,
  integrityValidatorPath: path.join(presentationSkill, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(presentationSkill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', `${Math.round(width*9525)},${Math.round(height*9525)}`, '--validate-bullet-geometry', '--validate-heading-fit'],
  explicitTotalSlideCount: plan.slides.length,
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: 'design', families },
  verifyArtifactToolImport: true,
  receiptPath: path.join(reportDir, 'final.validation.json') });
const require = createRequire(path.join(nodeModules, '.courseware-loader.cjs'));
const { FileBlob, PresentationFile } = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const presentation = await PresentationFile.importPptx(await FileBlob.load(finalPath));
const previews = path.join(path.dirname(finalPath), `${path.basename(finalPath, '.pptx')}-previews`);
await fs.mkdir(previews, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(previews, `slide-${String(index+1).padStart(2,'0')}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({ finalPath, previews, slideCount: presentation.slides.items.length }));
