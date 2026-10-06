use roxmltree::{Document, Node};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub file_path: String,
    pub file_name: String,
    pub relative_path: String,
    pub title: String,
    pub author: String,
    pub series: String,
    pub series_index: String,
    pub series_source: Option<String>,
    pub fingerprint: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub file_path: String,
    pub fingerprint: String,
    pub series: String,
    pub series_index: String,
    pub backup: bool,
    pub write_epub3: bool,
    pub write_calibre: bool,
}

pub fn fingerprint(path: &Path) -> Result<String> {
    let mut file = File::open(path).map_err(err)?;
    let mut hash = Sha256::new();
    let mut buf = [0; 65536];
    loop {
        let n = file.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn xml_entry(zip: &mut ZipArchive<File>, name: &str) -> Result<String> {
    let entry = zip.by_name(name).map_err(err)?;
    if entry.size() > 16 * 1024 * 1024 {
        return Err("XML entry exceeds 16 MiB".into());
    }
    let mut xml = String::new();
    entry
        .take(16 * 1024 * 1024 + 1)
        .read_to_string(&mut xml)
        .map_err(err)?;
    Ok(xml)
}

fn package(zip: &mut ZipArchive<File>) -> Result<(String, String)> {
    let container = xml_entry(zip, "META-INF/container.xml")?;
    let doc = Document::parse(&container).map_err(err)?;
    let path = doc
        .descendants()
        .find(|n| n.has_tag_name("rootfile"))
        .and_then(|n| n.attribute("full-path"))
        .ok_or("Missing OPF rootfile")?
        .to_string();
    let xml = xml_entry(zip, &path)?;
    Ok((path, xml))
}

fn text(n: Node<'_, '_>) -> String {
    n.descendants()
        .filter(|c| c.is_text())
        .filter_map(|c| c.text())
        .collect::<String>()
}
fn property(n: Node<'_, '_>, name: &str) -> bool {
    n.has_tag_name("meta") && n.attribute("property") == Some(name)
}
fn calibre(n: Node<'_, '_>, name: &str) -> bool {
    n.attribute("name") == Some(name)
        || n.attribute("property") == Some(name)
        || (n.tag_name().name() == name.strip_prefix("calibre:").unwrap_or(name)
            && n.tag_name()
                .namespace()
                .is_some_and(|ns| ns.contains("calibre")))
}
fn value(n: Node<'_, '_>) -> String {
    n.attribute("content")
        .map(str::to_string)
        .unwrap_or_else(|| text(n))
}
fn collection_kind<'a>(nodes: &[Node<'a, 'a>], collection: Node<'a, 'a>) -> Option<String> {
    let id = format!("#{}", collection.attribute("id")?);
    nodes
        .iter()
        .find(|n| property(**n, "collection-type") && n.attribute("refines") == Some(id.as_str()))
        .map(|n| text(*n))
}
fn series_collections<'a>(nodes: &[Node<'a, 'a>]) -> Vec<Node<'a, 'a>> {
    nodes
        .iter()
        .copied()
        .filter(|n| {
            property(*n, "belongs-to-collection")
                && collection_kind(nodes, *n).is_none_or(|kind| kind.trim() == "series")
        })
        .collect()
}

pub fn read(path: &Path, root: &Path) -> Result<Book> {
    let before = fingerprint(path)?;
    let mut zip = ZipArchive::new(File::open(path).map_err(err)?).map_err(err)?;
    let (_, xml) = package(&mut zip)?;
    let doc = Document::parse(&xml).map_err(err)?;
    let metadata = doc
        .descendants()
        .find(|n| n.has_tag_name("metadata"))
        .ok_or("Missing metadata")?;
    let nodes: Vec<_> = metadata.children().filter(|n| n.is_element()).collect();
    let mut collections = series_collections(&nodes);
    collections.sort_by_key(|n| collection_kind(&nodes, *n).is_none());
    let mut series = String::new();
    let mut index = String::new();
    let mut source = None;
    if let Some(node) = collections.first() {
        series = text(*node);
        if let Some(id) = node.attribute("id") {
            let reference = format!("#{id}");
            index = nodes
                .iter()
                .find(|n| {
                    property(**n, "group-position")
                        && n.attribute("refines") == Some(reference.as_str())
                })
                .map(|n| text(*n))
                .unwrap_or_default();
        }
        source = Some("epub3".into());
    }
    if series.is_empty() {
        if let Some(node) = nodes.iter().find(|n| calibre(**n, "calibre:series")) {
            series = value(*node);
            source = Some("calibre".into());
            index = nodes
                .iter()
                .find(|n| calibre(**n, "calibre:series_index"))
                .map(|n| value(*n))
                .unwrap_or_default();
        }
    }
    if fingerprint(path)? != before {
        return Err("File changed during scan; scan again".into());
    }
    Ok(Book {
        file_path: path.to_string_lossy().into(),
        file_name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        relative_path: path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/"),
        title: nodes
            .iter()
            .find(|n| n.tag_name().name() == "title")
            .map(|n| text(*n))
            .unwrap_or_default(),
        author: nodes
            .iter()
            .filter(|n| n.tag_name().name() == "creator")
            .map(|n| text(*n))
            .collect::<Vec<_>>()
            .join(", "),
        series,
        series_index: index,
        series_source: source,
        fingerprint: before,
    })
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn edit_xml(xml: &str, request: &SaveRequest) -> Result<String> {
    if !request.write_epub3 && !request.write_calibre {
        return Err("Select at least one metadata format".into());
    }
    let series = request.series.trim();
    let index = request.series_index.trim();
    if !index.is_empty()
        && (index
            .parse::<f64>()
            .map_or(true, |v| !v.is_finite() || v < 0.0)
            || !index.chars().all(|c| c.is_ascii_digit() || c == '.'))
    {
        return Err("Index must be a non-negative decimal number".into());
    }
    let doc = Document::parse(xml).map_err(err)?;
    let metadata = doc
        .descendants()
        .find(|n| n.has_tag_name("metadata"))
        .ok_or("Missing metadata")?;
    let nodes: Vec<_> = metadata.children().filter(|n| n.is_element()).collect();
    let collections = series_collections(&nodes);
    let references: HashSet<_> = collections
        .iter()
        .filter_map(|n| n.attribute("id"))
        .map(|id| format!("#{id}"))
        .collect();
    let mut ranges: Vec<_> = nodes
        .iter()
        .filter(|n| {
            collections.contains(n)
                || n.attribute("refines")
                    .is_some_and(|r| references.contains(r))
                || calibre(**n, "calibre:series")
                || calibre(**n, "calibre:series_index")
        })
        .map(|n| n.range())
        .collect();
    ranges.sort_by_key(|r| r.start);
    let mut output = xml.to_string();
    for range in ranges.iter().rev() {
        output.replace_range(range.clone(), "");
    }
    // Reparse after removals so byte offsets remain valid without serializing unrelated XML.
    let cleaned = Document::parse(&output).map_err(err)?;
    let metadata = cleaned
        .descendants()
        .find(|n| n.has_tag_name("metadata"))
        .ok_or("Missing metadata")?;
    let ns = metadata.tag_name().namespace();
    let prefix = ns
        .and_then(|ns| metadata.lookup_prefix(ns))
        .map(|p| format!("{p}:"))
        .unwrap_or_default();
    let tag = format!("{prefix}meta");
    let mut number = 1;
    let id = loop {
        let id = format!("series-{number}");
        if !cleaned
            .descendants()
            .any(|n| n.attribute("id") == Some(id.as_str()))
        {
            break id;
        }
        number += 1;
    };
    let mut insert = String::new();
    if !series.is_empty() && request.write_epub3 {
        insert += &format!("\n  <{tag} property=\"belongs-to-collection\" id=\"{id}\">{}</{tag}>\n  <{tag} refines=\"#{id}\" property=\"collection-type\">series</{tag}>", escape(series));
        if !index.is_empty() {
            insert += &format!(
                "\n  <{tag} refines=\"#{id}\" property=\"group-position\">{}</{tag}>",
                escape(index)
            );
        }
    }
    if !series.is_empty() && request.write_calibre {
        insert += &format!(
            "\n  <{tag} name=\"calibre:series\" content=\"{}\"/>",
            escape(series)
        );
        if !index.is_empty() {
            insert += &format!(
                "\n  <{tag} name=\"calibre:series_index\" content=\"{}\"/>",
                escape(index)
            );
        }
    }
    let range = metadata.range();
    let original = &output[range.clone()];
    if original.trim_end().ends_with("/>") {
        let pos = range.start + original.rfind("/>").ok_or("Invalid metadata")?;
        output.replace_range(pos..range.end, &format!(">{insert}\n</{prefix}metadata>"));
    } else {
        let pos = range.start + original.rfind("</").ok_or("Invalid metadata closing tag")?;
        output.insert_str(pos, &format!("{insert}\n"));
    }
    Document::parse(&output).map_err(err)?;
    Ok(output)
}

pub fn save(request: &SaveRequest, root: &Path) -> Result<Book> {
    let path = Path::new(&request.file_path);
    if fingerprint(path)? != request.fingerprint {
        return Err("File changed outside the editor; scan again".into());
    }
    let mut archive = ZipArchive::new(File::open(path).map_err(err)?).map_err(err)?;
    let (opf_path, xml) = package(&mut archive)?;
    let updated = edit_xml(&xml, request)?;
    let mut temp =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing parent directory")?)
            .map_err(err)?;
    {
        let mut writer = ZipWriter::new(temp.as_file_mut());
        writer
            .start_file(
                "mimetype",
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .map_err(err)?;
        writer.write_all(b"application/epub+zip").map_err(err)?;
        for i in 0..archive.len() {
            let entry = archive.by_index(i).map_err(err)?;
            if entry.name() == "mimetype" {
                continue;
            }
            if entry.name() == opf_path {
                writer
                    .start_file(
                        &opf_path,
                        SimpleFileOptions::default()
                            .compression_method(CompressionMethod::Deflated),
                    )
                    .map_err(err)?;
                writer.write_all(updated.as_bytes()).map_err(err)?;
            } else {
                writer.raw_copy_file(entry).map_err(err)?;
            }
        }
        writer.finish().map_err(err)?;
    }
    drop(archive);
    temp.as_file().sync_all().map_err(err)?;
    read(temp.path(), root)?;
    if fingerprint(path)? != request.fingerprint {
        return Err("File changed during save; original kept".into());
    }
    if request.backup {
        let mut number = 0;
        loop {
            let suffix = if number == 0 {
                ".bak".into()
            } else {
                format!(".bak.{number}")
            };
            let backup = format!("{}{suffix}", path.to_string_lossy());
            match File::options().write(true).create_new(true).open(&backup) {
                Ok(mut out) => {
                    let result = (|| {
                        let mut source = File::open(path)?;
                        std::io::copy(&mut source, &mut out)?;
                        out.sync_all()
                    })();
                    if let Err(e) = result {
                        drop(out);
                        let _ = fs::remove_file(&backup);
                        return Err(err(e));
                    }
                    break;
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => number += 1,
                Err(e) => return Err(err(e)),
            }
        }
    }
    let permissions = fs::metadata(path).map_err(err)?.permissions();
    if permissions.readonly() {
        return Err("File is read-only; original kept".into());
    }
    fs::set_permissions(temp.path(), permissions).map_err(err)?;
    if fingerprint(path)? != request.fingerprint {
        return Err("File changed during backup; original kept".into());
    }
    temp.persist(path).map_err(err)?;
    read(path, root)
}
