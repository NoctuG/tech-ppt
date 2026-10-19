#!/usr/bin/env python3
"""Inspect native objects and expected text in a PPTX; no rendering claims."""
import argparse
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}

def normalize(s):
    return re.sub(r'\s+', '', s)

def inspect(pptx, manifest=None):
    issues, slides = [], []
    with ZipFile(pptx) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError('Corrupt ZIP member: ' + bad)
        pres = ET.fromstring(archive.read('ppt/presentation.xml'))
        size = pres.find('p:sldSz', NS)
        width, height = int(size.get('cx')), int(size.get('cy'))
        # Follow relationship order; numeric slide filenames need not be display order.
        rels = ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))
        targets = {r.get('Id'): r.get('Target') for r in rels}
        relation_ns = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
        names = []
        import posixpath
        for item in pres.findall('p:sldIdLst/p:sldId', NS):
            target = targets[item.get(relation_ns)]
            names.append(target.lstrip('/') if target.startswith('/') else posixpath.normpath('ppt/' + target))
        if manifest and len(names) != len(manifest['slides']):
            issues.append('Slide count differs from manifest.')
        for index, filename in enumerate(names):
            root = ET.fromstring(archive.read(filename))
            shapes = root.findall('.//p:sp', NS)
            images = root.findall('.//p:pic', NS)
            texts = ['\n'.join(t.text or '' for t in shape.findall('.//a:t', NS)) for shape in shapes]
            texts = [s for s in texts if s.strip()]
            if not texts:
                issues.append(f'Slide {index+1}: no native editable text.')
            native_shapes = [s for s in shapes if not s.findall('.//a:t', NS)]
            for node in shapes + images:
                transform = node.find('p:spPr/a:xfrm', NS)
                if transform is None:
                    continue
                off, ext = transform.find('a:off', NS), transform.find('a:ext', NS)
                if off is None or ext is None:
                    continue
                x, y, w, h = (int(off.get('x')), int(off.get('y')), int(ext.get('cx')), int(ext.get('cy')))
                if min(x,y) < -9525 or x+w > width+9525 or y+h > height+9525:
                    issues.append(f'Slide {index+1}: object outside canvas.')
            if manifest and index < len(manifest['slides']):
                expected = manifest['slides'][index]['elements']
                actual = normalize(''.join(texts))
                for element in expected:
                    if element['type'] == 'text' and normalize(element['text']) not in actual:
                        issues.append(f'Slide {index+1}: missing native text {element["text"][:32]!r}.')
                if len(images) < sum(e['type'] == 'image' for e in expected):
                    issues.append(f'Slide {index+1}: fewer independent images than manifest.')
                if len(native_shapes) < sum(e['type'] == 'shape' for e in expected):
                    issues.append(f'Slide {index+1}: fewer native shapes than manifest.')
            slides.append({'slide': index+1, 'native_textboxes': len(texts), 'native_shapes_without_text': len(native_shapes), 'independent_images': len(images), 'text': texts})
    return {'passed': not issues, 'issues': issues, 'slides': slides, 'limits': 'Structural check only; does not prove visual quality or PowerPoint application compatibility.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    try:
        plan = json.loads(args.manifest.read_text(encoding='utf-8-sig')) if args.manifest else None
        report = inspect(args.pptx, plan)
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        print('Inspection failed: ' + str(error), file=sys.stderr)
        sys.exit(2)
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output, encoding='utf-8')
    print(output)
    sys.exit(0 if report['passed'] else 1)
