pub mod epub;
use epub::{Book, SaveRequest};
use serde::Serialize;
use std::{collections::HashSet, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct Session {
    root: Option<PathBuf>,
    allowed: HashSet<PathBuf>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Issue {
    file_path: String,
    error: String,
}
#[derive(Serialize)]
struct ScanResult {
    books: Vec<Book>,
    errors: Vec<Issue>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    file_path: String,
    book: Option<Book>,
    error: Option<String>,
}

#[tauri::command]
async fn open_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "desktop-tests")]
        if let Ok(directory) = std::env::var("EPUB_TEST_DIR") {
            let path = PathBuf::from(directory)
                .canonicalize()
                .map_err(|e| e.to_string())?;
            let state = app.state::<Mutex<Session>>();
            let mut session = state.lock().map_err(|e| e.to_string())?;
            session.root = Some(path.clone());
            session.allowed.clear();
            return Ok(Some(path.to_string_lossy().into()));
        }
        let chosen = app.dialog().file().blocking_pick_folder();
        if let Some(chosen) = chosen {
            let path = chosen
                .into_path()
                .map_err(|e| e.to_string())?
                .canonicalize()
                .map_err(|e| e.to_string())?;
            let state = app.state::<Mutex<Session>>();
            let mut session = state.lock().map_err(|e| e.to_string())?;
            session.root = Some(path.clone());
            session.allowed.clear();
            Ok(Some(path.to_string_lossy().into()))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_epubs(app: tauri::AppHandle, recursive: bool) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Session>>();
        let mut session = state.lock().map_err(|e| e.to_string())?;
        let root = session.root.clone().ok_or("Choose a directory first")?;
        let mut result = ScanResult {
            books: vec![],
            errors: vec![],
        };
        session.allowed.clear();
        for entry in walkdir::WalkDir::new(&root)
            .follow_links(false)
            .max_depth(if recursive { usize::MAX } else { 1 })
        {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    result.errors.push(Issue {
                        file_path: e.path().unwrap_or(&root).to_string_lossy().into(),
                        error: e.to_string(),
                    });
                    continue;
                }
            };
            if !entry.file_type().is_file()
                || !entry
                    .path()
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("epub"))
            {
                continue;
            }
            let path = match entry.path().canonicalize() {
                Ok(path) if path.starts_with(&root) => path,
                _ => continue,
            };
            match epub::read(&path, &root) {
                Ok(book) => {
                    session.allowed.insert(path);
                    result.books.push(book);
                }
                Err(error) => result.errors.push(Issue {
                    file_path: path.to_string_lossy().into(),
                    error,
                }),
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_epub(app: tauri::AppHandle, request: SaveRequest) -> Result<SaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<Session>>();
        let session = state.lock().map_err(|e| e.to_string())?;
        let root = session.root.as_ref().ok_or("Choose a directory first")?;
        let path = PathBuf::from(&request.file_path)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !path.starts_with(root) || !session.allowed.contains(&path) {
            return Err("File is outside the scanned directory".into());
        }
        let result = epub::save(&request, root);
        Ok(match result {
            Ok(book) => SaveResult {
                file_path: request.file_path,
                book: Some(book),
                error: None,
            },
            Err(error) => SaveResult {
                file_path: request.file_path,
                book: None,
                error: Some(error),
            },
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn app_version(app: tauri::AppHandle, _state: State<'_, Mutex<Session>>) -> String {
    app.package_info().version.to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Session::default()))
        .invoke_handler(tauri::generate_handler![
            open_directory,
            scan_epubs,
            save_epub,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start EPUB Metadata Editor");
}
