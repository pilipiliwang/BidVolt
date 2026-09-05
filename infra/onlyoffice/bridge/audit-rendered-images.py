"""Read-only Office conversion diagnostic; never saves or modifies a source document.

Run with the bundled artifact Python. The JSON records actual PDF image-paint
operations (including ONLYOFFICE tiling Patterns), not merely embedded media.
"""
import argparse
import base64
import hashlib
import hmac
import json
import subprocess
import time
import urllib.request
import uuid
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import ContentStream
import pypdfium2 as pdfium


def run(args):
    secret = subprocess.run(['docker', 'exec', 'bidvolt-onlyoffice-bridge', 'printenv', 'ONLYOFFICE_JWT_SECRET'],
                            capture_output=True, check=True).stdout.strip()
    payload = {'async': True, 'filetype': 'docx', 'outputtype': 'pdf', 'key': 'render-image-audit-' + uuid.uuid4().hex,
               'title': args.stem + '.docx', 'url': f'http://editor-bridge:8081/files/{args.file}/sessions/{args.session}'}
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    content = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode(payload)
    token = (content + b'.' + base64.urlsafe_b64encode(hmac.new(secret, content, hashlib.sha256).digest()).rstrip(b'=')).decode()
    request = urllib.request.Request('http://127.0.0.1:8080/converter', data=json.dumps({'token': token}).encode(),
                                     headers={'Content-Type': 'application/json'})
    deadline = time.time() + 600
    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / (args.stem + '.pdf')
    while time.time() < deadline:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
        if result.get('error'):
            raise RuntimeError('Office conversion failed: ' + str(result['error']))
        if result.get('endConvert'):
            with urllib.request.urlopen(result['fileUrl'], timeout=60) as response:
                target.write_bytes(response.read())
            break
        time.sleep(2)
    else:
        raise TimeoutError('Office conversion exceeded 10 minutes')
    reader = PdfReader(target)

    def images(stream, resources, seen=()):
        found = []
        for operands, operator in ContentStream(stream, reader).operations:
            entry = None
            if operator == b'Do' and operands:
                entry = resources.get('/XObject', {}).get(operands[0])
            elif operator in (b'scn', b'SCN') and operands:
                entry = resources.get('/Pattern', {}).get(operands[-1])
            if entry is None:
                continue
            identity = getattr(entry, 'idnum', id(entry))
            if identity in seen:
                continue
            obj = entry.get_object()
            if obj.get('/Subtype') == '/Image':
                found.append(identity)
            elif hasattr(obj, 'get_data'):
                found.extend(images(obj, obj.get('/Resources', resources), (*seen, identity)))
        return found

    image_pages, unique = [], set()
    for index, page in enumerate(reader.pages):
        draws = images(page.get_contents(), page.get('/Resources', {}))
        unique.update(draws)
        if draws:
            image_pages.append({'page': index + 1, 'draws': len(draws)})
    summary = {'fileId': args.file, 'sessionId': args.session, 'pdfSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
               'pages': len(reader.pages), 'imageDraws': sum(p['draws'] for p in image_pages),
               'uniqueDrawnImages': len(unique), 'imagePages': image_pages,
               'scope': 'PDF paint-operation census plus selected rendered pages, not every-page visual verification'}
    (args.output / (args.stem + '.json')).write_text(json.dumps(summary, indent=2), encoding='utf-8')
    selected = list(dict.fromkeys([p['page'] for p in image_pages[:2] + image_pages[-2:]]))
    doc = pdfium.PdfDocument(target)
    for number in selected:
        bitmap = doc[number - 1].render(scale=1.3)
        bitmap.to_pil().save(args.output / f'{args.stem}-page-{number}.png')
        bitmap.close()
    doc.close()
    print(json.dumps({**summary, 'imagePages': image_pages[:3], 'renderedPages': selected}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', required=True)
    parser.add_argument('--session', required=True)
    parser.add_argument('--stem', default='office-images')
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args())
