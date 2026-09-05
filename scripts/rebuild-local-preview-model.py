"""Rebuild one derived local preview JSON, backing it up without modifying its source."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil

spec = importlib.util.spec_from_file_location('prepare_local_package', Path(__file__).with_name('prepare-local-package.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def rebuild(root, file_id):
    if not re.fullmatch(r'file-\d+', file_id):
        raise ValueError('Invalid local file id')
    root = root.resolve(strict=True)
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    directory = manifest['directory']
    if not re.fullmatch(r'[a-f0-9]{12}', directory):
        raise ValueError('Invalid local package directory')
    item = next(item for item in manifest['files'] if item['id'] == file_id)
    if item['extension'] != '.docx':
        raise ValueError('This rebuild only supports DOCX image models')
    source = (root / directory / (file_id + '.docx')).resolve(strict=True)
    target = (root / directory / (file_id + '.json')).resolve(strict=True)
    if source.parent != root / directory or target.parent != root / directory:
        raise ValueError('Resolved package paths escaped the selected package')
    original = source.read_bytes()
    original_hash = hashlib.sha256(original).hexdigest()
    if original_hash != item['sha256']:
        raise ValueError('Original checksum differs from manifest; do not silently rebuild another source')
    model = module.docx_model(original)
    image_count = sum(block.get('type') == 'image' for page in model['wordDocument']['pages'] for block in page['blocks'])
    backup = target.with_suffix('.json.' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.bak')
    shutil.copy2(target, backup)
    pending = target.with_suffix('.json.pending')
    with pending.open('x', encoding='utf-8') as stream:
        json.dump(model, stream, ensure_ascii=False, separators=(',', ':'))
    pending.replace(target)
    if hashlib.sha256(source.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError('Source checksum unexpectedly changed')
    return {'source': str(source), 'sourceSha256': original_hash, 'sourceUnchanged': True,
            'derivedTarget': str(target), 'backup': str(backup), 'imageBlocks': image_count}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--file', required=True)
    args = parser.parse_args()
    print(json.dumps(rebuild(args.root, args.file)))
