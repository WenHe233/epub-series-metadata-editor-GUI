use epub_editor::epub::{self, SaveRequest};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

fn fixture(path: &Path, metadata: &str) {
    fixture_version(path, metadata, "3.0");
}
fn fixture_version(path: &Path, metadata: &str, version: &str) {
    let mut zip = ZipWriter::new(File::create(path).unwrap());
    for (name, data) in [
        ("mimetype", "application/epub+zip".to_string()),
        ("META-INF/container.xml", "<container xmlns='urn:oasis:names:tc:opendocument:xmlns:container'><rootfiles><rootfile full-path='OPS/book.opf'/></rootfiles></container>".into()),
        ("OPS/book.opf", format!("<?xml version='1.0'?><opf:package xmlns:opf='http://www.idpf.org/2007/opf' xmlns:dc='http://purl.org/dc/elements/1.1/' version='{version}'><opf:metadata><dc:title>测试 &amp; Book</dc:title><dc:creator>A</dc:creator><dc:creator>B</dc:creator>{metadata}</opf:metadata><opf:manifest/></opf:package>")),
        ("OPS/text.xhtml", "<html>Unchanged &amp; content</html>".into()),
        ("OPS/image.bin", "image data".into()),
    ] { zip.start_file(name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).unwrap(); zip.write_all(data.as_bytes()).unwrap(); }
    zip.finish().unwrap();
}
fn request(path: &Path) -> SaveRequest {
    SaveRequest {
        file_path: path.to_string_lossy().into(),
        fingerprint: epub::fingerprint(path).unwrap(),
        series: "系列 & <Name> \" '".into(),
        series_index: "1.5".into(),
        backup: true,
        write_epub3: true,
        write_calibre: true,
    }
}
fn entry(path: &Path, name: &str) -> Vec<u8> {
    let mut z = ZipArchive::new(File::open(path).unwrap()).unwrap();
    let mut data = vec![];
    z.by_name(name).unwrap().read_to_end(&mut data).unwrap();
    data
}

#[test]
fn round_trip_preserves_content_and_backup_and_mimetype() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("书.epub");
    fixture(&path, "");
    let original = fs::read(&path).unwrap();
    let req = request(&path);
    let book = epub::save(&req, dir.path()).unwrap();
    assert_eq!(book.series, req.series);
    assert_eq!(book.series_index, "1.5");
    assert_eq!(book.title, "测试 & Book");
    assert_eq!(book.author, "A, B");
    assert_eq!(fs::read(dir.path().join("书.epub.bak")).unwrap(), original);
    assert_eq!(
        entry(&path, "OPS/text.xhtml"),
        b"<html>Unchanged &amp; content</html>"
    );
    assert_eq!(entry(&path, "OPS/image.bin"), b"image data");
    let mut z = ZipArchive::new(File::open(&path).unwrap()).unwrap();
    let mime = z.by_index(0).unwrap();
    assert_eq!(mime.name(), "mimetype");
    assert_eq!(mime.compression(), CompressionMethod::Stored);
    drop(mime);
    drop(z);
    let mut req = req;
    req.fingerprint = book.fingerprint;
    let updated = fs::read(&path).unwrap();
    epub::save(&req, dir.path()).unwrap();
    assert_eq!(fs::read(dir.path().join("书.epub.bak")).unwrap(), original);
    assert_eq!(fs::read(dir.path().join("书.epub.bak.1")).unwrap(), updated);
    let xml = String::from_utf8(entry(&path, "OPS/book.opf")).unwrap();
    assert_eq!(xml.matches("property=\"belongs-to-collection\"").count(), 1);
}
#[test]
fn formats_clear_and_non_series_collection() {
    for (epub3, calibre) in [(true, true), (true, false), (false, true)] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.epub");
        fixture(&path,"<opf:meta property='belongs-to-collection' id='set'>Keep me</opf:meta><opf:meta refines='#set' property='collection-type'>set</opf:meta><opf:meta refines='#set' property='group-position'>8</opf:meta><opf:meta name='calibre:series' content='old'/>");
        let mut req = request(&path);
        req.write_epub3 = epub3;
        req.write_calibre = calibre;
        req.backup = false;
        let saved = epub::save(&req, dir.path()).unwrap();
        assert_eq!(
            saved.series_source.as_deref(),
            Some(if epub3 { "epub3" } else { "calibre" })
        );
        let xml = String::from_utf8(entry(&path, "OPS/book.opf")).unwrap();
        assert!(xml.contains("Keep me"));
        assert!(xml.contains(">8</opf:meta>"));
        assert_eq!(xml.contains("name=\"calibre:series\""), calibre);
        req.series.clear();
        req.series_index.clear();
        req.fingerprint = saved.fingerprint;
        let cleared = epub::save(&req, dir.path()).unwrap();
        assert!(cleared.series.is_empty());
        assert!(String::from_utf8(entry(&path, "OPS/book.opf"))
            .unwrap()
            .contains("Keep me"));
        assert!(!dir.path().join("book.epub.bak").exists());
    }
}
#[test]
fn explicit_series_beats_legacy_and_calibre() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("book.epub");
    fixture(&path,"<opf:meta property='belongs-to-collection'>Legacy</opf:meta><opf:meta property='belongs-to-collection' id='real'>Real</opf:meta><opf:meta refines='#real' property='collection-type'>series</opf:meta><opf:meta name='calibre:series' content='Calibre'/>");
    assert_eq!(epub::read(&path, dir.path()).unwrap().series, "Real");
}
#[test]
fn calibre_epub2_and_legacy_collection_read() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("book.epub");
    fixture_version(&path,"<opf:meta name='calibre:series' content='Calibre'/><opf:meta name='calibre:series_index' content='2.5'/>", "2.0");
    let b = epub::read(&path, dir.path()).unwrap();
    assert_eq!(b.series, "Calibre");
    assert_eq!(b.series_index, "2.5");
    fixture(&path,"<opf:meta property='belongs-to-collection' id='a'>Legacy</opf:meta><opf:meta property='group-position' refines='#a'>3</opf:meta>");
    assert_eq!(epub::read(&path, dir.path()).unwrap().series, "Legacy");
}
#[test]
fn conflict_invalid_options_and_index_leave_original_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("book.epub");
    fixture(&path, "");
    let original = fs::read(&path).unwrap();
    let mut req = request(&path);
    req.write_epub3 = false;
    req.write_calibre = false;
    assert!(epub::save(&req, dir.path()).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    req.write_epub3 = true;
    req.series_index = "<bad>".into();
    assert!(epub::save(&req, dir.path()).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    req.series_index = "2".into();
    fixture(&path, "<opf:meta name='changed' content='yes'/>");
    let changed = fs::read(&path).unwrap();
    assert!(epub::save(&req, dir.path())
        .unwrap_err()
        .contains("outside"));
    assert_eq!(fs::read(&path).unwrap(), changed);
}
#[test]
fn corrupt_readonly_and_failed_backup_do_not_destroy_original() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("book.epub");
    fs::write(&path, b"not a zip").unwrap();
    assert!(epub::read(&path, dir.path()).is_err());
    fixture(&path, "");
    let original = fs::read(&path).unwrap();
    let req = request(&path);
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&path, permissions.clone()).unwrap();
    assert!(epub::save(&req, dir.path()).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
    #[allow(clippy::permissions_set_readonly_false)]
    {
        permissions.set_readonly(false);
    }
    fs::set_permissions(&path, permissions).unwrap();
    fs::create_dir(dir.path().join("book.epub.bak.1")).unwrap();
    // The existing backup and directory are skipped; a new numbered backup is created.
    epub::save(&req, dir.path()).unwrap();
    assert_eq!(
        fs::read(dir.path().join("book.epub.bak.2")).unwrap(),
        original
    );
}
#[test]
fn self_closing_metadata_and_default_namespace() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("book.epub");
    fixture(&path, "");
    let req = request(&path);
    let xml = "<package xmlns='http://www.idpf.org/2007/opf'><metadata/><manifest/></package>";
    let updated = epub::edit_xml(xml, &req).unwrap();
    assert!(updated.contains("<meta property="));
    assert!(updated.contains("<manifest/>"));
    assert!(roxmltree::Document::parse(&updated).is_ok());
}
