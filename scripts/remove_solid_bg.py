#!/usr/bin/env python3
"""Remove border-connected near-solid background, not semantic segmentation."""
import argparse
from collections import deque
from pathlib import Path
from PIL import Image

def remove(source, color, tolerance):
    image = source.convert('RGBA')
    width, height = image.size
    pixels = image.load()
    seen = bytearray(width * height)
    queue = deque()
    def push(x, y):
        idx = y * width + x
        if seen[idx]:
            return
        seen[idx] = 1
        value = pixels[x, y]
        if max(abs(value[c] - color[c]) for c in range(3)) <= tolerance:
            queue.append((x, y))
    for x in range(width):
        push(x, 0)
        push(x, height-1)
    for y in range(height):
        push(0, y)
        push(width-1, y)
    count = 0
    while queue:
        x, y = queue.popleft()
        r, g, b, a = pixels[x, y]
        pixels[x, y] = (r,g,b,0)
        count += 1
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < width and 0 <= ny < height:
                push(nx,ny)
    if count == 0 or count == width * height:
        raise ValueError('No useful foreground/background split; inspect input or choose a different color.')
    return image, count

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--color', required=True, help='Solid background hex, e.g. FF00FF')
    parser.add_argument('--tolerance', type=int, default=35, choices=range(0,256), metavar='0..255')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output exists; use a versioned new filename.')
    value = args.color.lstrip('#')
    if len(value) != 6:
        parser.error('--color must have six hexadecimal digits')
    color = tuple(int(value[i:i+2], 16) for i in (0,2,4))
    with Image.open(args.input) as source:
        result, count = remove(source, color, args.tolerance)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, format='PNG')
    print(f'Saved RGBA: {args.output}; removed {count} border-connected pixels. Inspect edges and enclosed holes manually.')
