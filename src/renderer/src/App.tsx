import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  FolderOpen,
  Folder,
  Save,
  Undo2,
  Search,
  Sun,
  Moon,
  RefreshCw,
  PanelRight,
  ChevronRight,
  ChevronDown,
  ListOrdered,
  ArrowDown01,
  Wand2,
  FolderInput,
  X,
  Check,
  AlertCircle,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, desktop } from "./api";
import {
  Book,
  Issue,
  SaveOptions,
  dirty,
  folderOf,
  inFolder,
  numberBooks,
  reorder,
  majority,
  commonParent,
  selectRange,
} from "./model";
import BookRow from "./components/BookRow";
import icon from "../../../assets/icon.svg";

export default function App() {
  const { t, i18n } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]),
    [original, setOriginal] = useState<Map<string, Book>>(new Map());
  const [root, setRoot] = useState(""),
    [recursive, setRecursive] = useState(false),
    [folder, setFolder] = useState("");
  const [selected, setSelected] = useState(new Set<string>()),
    [anchor, setAnchor] = useState<string | null>(null);
  const [history, setHistory] = useState<Book[][]>([]),
    [query, setQuery] = useState(""),
    [series, setSeries] = useState("");
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [errors, setErrors] = useState<Issue[]>([]);
  const [options, setOptions] = useState<SaveOptions>({
    backup: true,
    writeEpub3: true,
    writeCalibre: true,
  });
  const [panel, setPanel] = useState(true),
    [collapsed, setCollapsed] = useState(new Set<string>());
  const [dark, setDark] = useState(() =>
    localStorage.getItem("theme")
      ? localStorage.getItem("theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [version, setVersion] = useState(""),
    [widths, setWidths] = useState([36, 28, 260, 200, 230, 85, 40]);
  const [pending, setPending] = useState<null | (() => Promise<void>)>(null);
  const closeAction = useRef<() => void>(() => {});
  const allowClose = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const modified = books.filter((b) => dirty(b, original.get(b.filePath)));
  const chosen = books.filter((b) => selected.has(b.filePath));
  const visible = books.filter(
    (b) =>
      inFolder(b, folder) &&
      [b.fileName, b.title, b.series].some((s) =>
        s.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const folders = [
    ...new Set(
      books.flatMap((b) => {
        const parts = folderOf(b).split("/").filter(Boolean);
        return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      }),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (desktop)
      api
        .version()
        .then(setVersion)
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      if (!allowClose.current) {
        event.preventDefault();
        closeAction.current();
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
  const guard = (action: () => Promise<void>) => {
    if (busy) return;
    if (modified.length) setPending(() => action);
    else void action();
  };
  closeAction.current = () =>
    guard(async () => {
      allowClose.current = true;
      await getCurrentWindow().close();
    });
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (modified.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [modified.length]);
  const commit = (next: Book[], recordHistory = true) => {
    if (next === books || JSON.stringify(next) === JSON.stringify(books))
      return;
    if (recordHistory) setHistory((h) => [...h, books].slice(-20));
    setBooks(next);
  };
  const undo = () => {
    if (history.length) {
      setBooks(history[history.length - 1]);
      setHistory((h) => h.slice(0, -1));
    }
  };
  const scan = async (nextRoot: string, recurse: boolean) => {
    setBusy(true);
    setStatus(t("scanning"));
    setErrors([]);
    try {
      const result = await api.scan(recurse);
      result.books.sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
      setBooks(result.books);
      setOriginal(new Map(result.books.map((b) => [b.filePath, b])));
      setRoot(nextRoot);
      setRecursive(recurse);
      setSelected(new Set());
      setHistory([]);
      setFolder("");
      setAnchor(null);
      setErrors(result.errors);
      setStatus(
        result.errors.length
          ? t("failed")
          : result.books.length
            ? t("ready")
            : t("noEpub"),
      );
    } catch (e) {
      setStatus(t("scanError"));
      setErrors([{ filePath: nextRoot, error: String(e) }]);
    } finally {
      setBusy(false);
    }
  };
  const open = () =>
    guard(async () => {
      if (!desktop) {
        setStatus(t("webOnly"));
        return;
      }
      try {
        const dir = await api.openDirectory();
        if (dir) await scan(dir, recursive);
      } catch (e) {
        setErrors([{ filePath: "", error: String(e) }]);
      }
    });
  const save = async (): Promise<boolean> => {
    if (!options.writeEpub3 && !options.writeCalibre) {
      setStatus(t("noFormats"));
      return false;
    }
    setBusy(true);
    setErrors([]);
    const failures: Issue[] = [];
    const saved = new Map<string, Book>();
    try {
      for (let i = 0; i < modified.length; i++) {
        const book = modified[i];
        setStatus(t("saving") + " " + (i + 1) + "/" + modified.length);
        try {
          const result = await api.save(book, options);
          if (result.book) saved.set(book.filePath, result.book);
          else
            failures.push({
              filePath: book.filePath,
              error: result.error || t("failed"),
            });
        } catch (e) {
          failures.push({ filePath: book.filePath, error: String(e) });
        }
      }
      setBooks((prev) => prev.map((b) => saved.get(b.filePath) || b));
      setOriginal((prev) => new Map([...prev, ...saved]));
      setHistory([]);
      setErrors(failures);
      setStatus(failures.length ? t("failed") : t("saved"));
      return !failures.length;
    } finally {
      setBusy(false);
    }
  };
  const batchSeries = () =>
    commit(
      books.map((b) =>
        selected.has(b.filePath)
          ? { ...b, series, seriesIndex: series.trim() ? b.seriesIndex : "" }
          : b,
      ),
    );
  const toggleFolder = (path: string, checked: boolean) => {
    const next = new Set(selected);
    books
      .filter((b) => inFolder(b, path))
      .forEach((b) =>
        checked ? next.add(b.filePath) : next.delete(b.filePath),
      );
    setSelected(next);
  };
  const resize = (event: React.PointerEvent, index: number) => {
    const start = event.clientX,
      width = widths[index];
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) =>
      setWidths((w) =>
        w.map((v, i) =>
          i === index ? Math.max(70, width + e.clientX - start) : v,
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={icon} alt="" />
          <div>
            <h1>{t("title")}</h1>
            <p>{t("subtitle")}</p>
          </div>
        </div>
        <div className="toolbar">
          <select
            aria-label={t("language")}
            value={i18n.resolvedLanguage}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
          <button
            className="icon-button"
            aria-label={t("theme")}
            title={t("theme")}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="primary" onClick={open} disabled={busy}>
            <FolderOpen size={17} />
            {t("open")}
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">
            {t("library")}
            <button
              className="icon-button"
              title={t("refresh")}
              aria-label={t("refresh")}
              disabled={!root || busy}
              onClick={() => guard(() => scan(root, recursive))}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <button
            className={"folder-entry " + (!folder ? "active" : "")}
            onClick={() => setFolder("")}
          >
            <FolderOpen size={17} />
            <span>{t("allBooks")}</span>
            <small>{books.length}</small>
          </button>
          <div className="folder-tree">
            {folders
              .filter(
                (path) =>
                  !path
                    .split("/")
                    .slice(0, -1)
                    .some((_, i, a) =>
                      collapsed.has(a.slice(0, i + 1).join("/")),
                    ),
              )
              .map((path) => {
                const children = books.filter((b) => inFolder(b, path)),
                  checked =
                    children.length > 0 &&
                    children.every((b) => selected.has(b.filePath));
                return (
                  <div
                    className={
                      "folder-entry " + (folder === path ? "active" : "")
                    }
                    key={path}
                    style={{
                      paddingLeft: 8 + (path.split("/").length - 1) * 14,
                    }}
                  >
                    <button
                      className="icon-button collapse"
                      aria-label={path}
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          next.has(path) ? next.delete(path) : next.add(path);
                          return next;
                        })
                      }
                    >
                      {collapsed.has(path) ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </button>
                    <input
                      type="checkbox"
                      aria-label={t("selectBook") + " " + path}
                      disabled={busy}
                      checked={checked}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            !checked &&
                            children.some((b) => selected.has(b.filePath));
                      }}
                      onChange={(e) => toggleFolder(path, e.target.checked)}
                    />
                    <button
                      className="folder-name"
                      title={path}
                      onClick={() => setFolder(path)}
                    >
                      <Folder size={15} />
                      <span>{path.split("/").slice(-1)[0]}</span>
                    </button>
                    <small>{children.length}</small>
                  </div>
                );
              })}
          </div>
          <div className="sidebar-bottom">
            <label className="check-label">
              <input
                type="checkbox"
                checked={recursive}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.checked;
                  root ? guard(() => scan(root, next)) : setRecursive(next);
                }}
              />
              {t("recursive")}
            </label>
            <p title={root}>{root || t("noFolder")}</p>
          </div>
        </aside>
        <main className="main">
          <div className="list-toolbar">
            <div>
              <h2>{folder.split("/").slice(-1)[0] || t("allBooks")}</h2>
              <span className="muted">
                {visible.length} {t("books")}
              </span>
            </div>
            <div className="toolbar">
              <button
                className="icon-button"
                title={t("undo")}
                aria-label={t("undo")}
                disabled={!history.length || busy}
                onClick={undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                title={t("editPanel")}
                aria-label={t("editPanel")}
                onClick={() => setPanel(!panel)}
              >
                <PanelRight size={18} />
              </button>
            </div>
          </div>
          <div className="search">
            <Search size={17} />
            <input
              aria-label={t("search")}
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                onClick={() => setQuery("")}
                aria-label={t("clear")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="table-scroll">
            {!root ? (
              <div className="empty">
                <img src={icon} alt="" />
                <h2>{t("emptyTitle")}</h2>
                <p>{t("emptyHint")}</p>
                <button onClick={open} className="primary">
                  <FolderOpen size={17} />
                  {t("open")}
                </button>
              </div>
            ) : !visible.length ? (
              <div className="empty">
                <Search size={32} />
                <h2>{busy ? t("scanning") : t("noResults")}</h2>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                  if (!over || active.id === over.id) return;
                  const next = reorder(
                    books,
                    String(active.id),
                    String(over.id),
                  );
                  if (next === books) setStatus(t("sameFolder"));
                  else commit(next);
                }}
              >
                <SortableContext
                  items={visible.map((b) => b.filePath)}
                  strategy={verticalListSortingStrategy}
                >
                  <table>
                    <colgroup>
                      {widths.map((w, i) => (
                        <col key={i} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label={t("selectAll")}
                            disabled={busy}
                            checked={
                              visible.length > 0 &&
                              visible.every((b) => selected.has(b.filePath))
                            }
                            ref={(el) => {
                              if (el)
                                el.indeterminate =
                                  visible.some((b) =>
                                    selected.has(b.filePath),
                                  ) &&
                                  !visible.every((b) =>
                                    selected.has(b.filePath),
                                  );
                            }}
                            onChange={(e) => {
                              const next = new Set(selected);
                              visible.forEach((b) =>
                                e.target.checked
                                  ? next.add(b.filePath)
                                  : next.delete(b.filePath),
                              );
                              setSelected(next);
                            }}
                          />
                        </th>
                        <th />
                        {["filename", "bookTitle", "series", "index"].map(
                          (label, i) => (
                            <th key={label}>
                              {t(label)}
                              <span
                                role="separator"
                                aria-label={t("resize") + " " + t(label)}
                                className="resizer"
                                onPointerDown={(e) => resize(e, i + 2)}
                              />
                            </th>
                          ),
                        )}
                        <th aria-label={t("status")} />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((book) => (
                        <BookRow
                          key={book.filePath}
                          book={book}
                          disabled={busy}
                          selected={selected.has(book.filePath)}
                          modified={dirty(book, original.get(book.filePath))}
                          select={(shift) => {
                            setSelected(
                              selectRange(
                                visible,
                                selected,
                                anchor,
                                book.filePath,
                                shift,
                              ),
                            );
                            setAnchor(book.filePath);
                          }}
                          edit={(field, value, recordHistory) =>
                            commit(
                              books.map((b) =>
                                b.filePath === book.filePath
                                  ? { ...b, [field]: value }
                                  : b,
                              ),
                              recordHistory,
                            )
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </SortableContext>
              </DndContext>
            )}
          </div>
          {errors.length > 0 && (
            <div className="errors" role="alert">
              <strong>
                <AlertCircle size={16} />
                {t("errors")} ({errors.length})
              </strong>
              {errors.map((e, i) => (
                <p key={i}>
                  <b>{e.filePath.split(/[/\\]/).slice(-1)[0]}</b> {e.error}
                </p>
              ))}
            </div>
          )}
          <div className="selection-bar">
            <span>
              {selected.size} {t("selected")}
            </span>
            {selected.size > 0 && (
              <button
                className="text-button"
                onClick={() => setSelected(new Set())}
              >
                {t("clear")}
              </button>
            )}
            <span className="spacer" />
            <span>
              {modified.length} {t("pending")}
            </span>
          </div>
        </main>
        {panel && (
          <aside className="editor-panel">
            <div className="panel-heading">
              <h2>{t("batch")}</h2>
              <span className="badge">{chosen.length}</span>
            </div>
            <p className="muted">{t("batchHint")}</p>
            <fieldset disabled={!chosen.length || busy}>
              <label className="field-label" htmlFor="series-name">
                {t("seriesName")}
              </label>
              <input
                id="series-name"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder={t("seriesName")}
              />
              <div className="helper-actions">
                <button
                  title={t("parent")}
                  onClick={() => setSeries(commonParent(chosen, root))}
                >
                  <FolderInput size={15} />
                  {t("parent")}
                </button>
                <button
                  title={t("majority")}
                  onClick={() => setSeries(majority(chosen))}
                >
                  <Wand2 size={15} />
                  {t("majority")}
                </button>
              </div>
              <button className="primary full" onClick={batchSeries}>
                <Check size={16} />
                {t("apply")}
              </button>
              <div className="number-actions">
                <button onClick={() => commit(numberBooks(books, selected))}>
                  <ListOrdered size={17} />
                  {t("auto")}
                </button>
                <button
                  onClick={() => commit(numberBooks(books, selected, true))}
                >
                  <ArrowDown01 size={17} />
                  {t("smart")}
                </button>
                <p className="muted">{t("smartHint")}</p>
              </div>
            </fieldset>
            <div className="save-options">
              <div className="section-label">{t("format")}</div>
              <fieldset disabled={busy}>
                {(["backup", "writeEpub3", "writeCalibre"] as const).map(
                  (key, i) => (
                    <label key={key} className="check-label">
                      <input
                        type="checkbox"
                        checked={options[key]}
                        onChange={(e) =>
                          setOptions({ ...options, [key]: e.target.checked })
                        }
                      />
                      {t(["backup", "epub3", "calibre"][i])}
                    </label>
                  ),
                )}
              </fieldset>
              <p className="muted">{t("formatHint")}</p>
            </div>
            <div className="save-area">
              <button
                className="primary full"
                disabled={
                  busy ||
                  !modified.length ||
                  (!options.writeEpub3 && !options.writeCalibre)
                }
                onClick={() => void save()}
              >
                <Save size={17} />
                {t("save")}
                {modified.length > 0 && (
                  <span className="button-count">{modified.length}</span>
                )}
              </button>
            </div>
          </aside>
        )}
      </div>
      <footer>
        <span className={"status-light " + (busy ? "busy" : "")} />
        <span role="status">{status || t("ready")}</span>
        <span className="spacer" />
        <span>EPUB Metadata Editor {version && "v" + version}</span>
      </footer>
      {pending && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <h2 id="unsaved-title">{t("discardTitle")}</h2>
            <p>{t("discardText")}</p>
            <div className="modal-buttons">
              <button disabled={busy} onClick={() => setPending(null)}>
                {t("cancel")}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  void action();
                }}
              >
                {t("discard")}
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (await save()) {
                    const action = pending;
                    setPending(null);
                    await action();
                  }
                }}
              >
                {t("saveContinue")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
