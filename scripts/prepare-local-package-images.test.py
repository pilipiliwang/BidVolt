"""Isolated in-memory fixtures: source DOCX bytes are never rewritten."""
import base64
import importlib.util
import io
from pathlib import Path
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('prepare_local_package', Path(__file__).with_name('prepare-local-package.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1EAAAAASUVORK5CYII=')


def fixture(body, target='media/image1.png', external=False):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>' + body + '</w:body></w:document>')
        archive.writestr('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Target="' + target + '"' + (' TargetMode="External"' if external else '') + '/></Relationships>')
        archive.writestr('word/media/image1.png', PNG)
    return stream.getvalue()


IMAGE = '<w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r>'


class LocalPackageImages(unittest.TestCase):
    def blocks(self, source):
        return [block for page in module.docx_model(source)['wordDocument']['pages'] for block in page['blocks']]

    def test_picture_only_and_mixed_paragraphs_keep_image_and_text_order(self):
        source = fixture('<w:p>' + IMAGE + '</w:p><w:p><w:r><w:t>Before</w:t></w:r>' + IMAGE + '<w:r><w:t>After</w:t></w:r></w:p>')
        blocks = self.blocks(source)
        self.assertEqual([b['type'] for b in blocks], ['image', 'paragraph', 'image', 'paragraph'])
        self.assertEqual([b['text'] for b in blocks], ['', 'Before', '', 'After'])
        self.assertEqual(base64.b64decode(blocks[0]['image']['src'].split(',')[1]), PNG)

    def test_table_picture_and_alternate_content_are_not_lost_or_duplicated(self):
        alternate = '<mc:AlternateContent><mc:Choice>' + IMAGE + '</mc:Choice><mc:Fallback><v:imagedata r:id="rId1"/></mc:Fallback></mc:AlternateContent>'
        blocks = self.blocks(fixture('<w:tbl><w:tr><w:tc><w:p>' + alternate + '</w:p></w:tc></w:tr></w:tbl>'))
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]['type'], 'image')

    def test_unresolvable_and_external_images_stay_visible_without_external_fetch(self):
        for target, external in [('https://example.test/private.png', True), ('../../outside.png', False), ('media/missing.png', False)]:
            blocks = self.blocks(fixture('<w:p>' + IMAGE + '</w:p>', target, external))
            self.assertEqual(blocks[0]['type'], 'image')
            self.assertNotIn('src', blocks[0]['image'])


if __name__ == '__main__':
    unittest.main()
