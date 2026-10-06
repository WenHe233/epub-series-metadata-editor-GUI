"""Generate disposable EPUBs for real desktop integration tests."""
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
for i in range(1, 4):
    path = root / f"{i:02}.epub"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
        archive.writestr("OPS/book.opf", f'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>测试 Book {i}</dc:title><dc:creator>Author</dc:creator><meta name="calibre:series" content="Original"/><meta name="calibre:series_index" content="{i}"/></metadata><manifest><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="text"/></spine></package>')
        archive.writestr("OPS/text.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Keep this text.</p></body></html>')
print(root)
