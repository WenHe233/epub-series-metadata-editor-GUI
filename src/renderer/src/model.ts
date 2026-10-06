export interface Book {
  filePath: string;
  fileName: string;
  relativePath: string;
  title: string;
  author: string;
  series: string;
  seriesIndex: string;
  seriesSource: "epub3" | "calibre" | null;
  fingerprint: string;
}
export interface Issue {
  filePath: string;
  error: string;
}
export interface ScanResult {
  books: Book[];
  errors: Issue[];
}
export interface SaveOptions {
  backup: boolean;
  writeEpub3: boolean;
  writeCalibre: boolean;
}
export interface SaveResult {
  filePath: string;
  book: Book | null;
  error: string | null;
}
export const folderOf = (book: Book) =>
  book.relativePath.split("/").slice(0, -1).join("/");
export const inFolder = (book: Book, folder: string) =>
  !folder || book.relativePath.startsWith(folder + "/");
export function dirty(book: Book, original?: Book) {
  const index = (s: string) =>
    s.trim() !== "" && Number.isFinite(Number(s))
      ? String(Number(s))
      : s.trim();
  return (
    !original ||
    book.series.trim() !== original.series.trim() ||
    index(book.seriesIndex) !== index(original.seriesIndex)
  );
}
export function numberBooks(
  books: Book[],
  selected: Set<string>,
  smart = false,
): Book[] {
  let next = 1;
  let first = true;
  return books.map((book) => {
    if (!selected.has(book.filePath)) return book;
    if (smart && first) {
      first = false;
      next = Math.floor(Number(book.seriesIndex) || 0) + 1;
      return book;
    }
    return { ...book, seriesIndex: String(next++) };
  });
}
export function reorder(books: Book[], active: string, over: string): Book[] {
  const a = books.findIndex((b) => b.filePath === active),
    b = books.findIndex((b) => b.filePath === over);
  if (a < 0 || b < 0 || folderOf(books[a]) !== folderOf(books[b])) return books;
  const result = [...books];
  const [item] = result.splice(a, 1);
  result.splice(b, 0, item);
  return result;
}
export function majority(books: Book[]): string {
  const counts = new Map<string, number>();
  for (const b of books)
    if (b.series.trim()) counts.set(b.series, (counts.get(b.series) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}
export function commonParent(books: Book[], root: string): string {
  const folders = books.map((b) =>
    b.filePath.replaceAll("\\", "/").split("/").slice(0, -1),
  );
  if (!folders.length) return "";
  const parts = folders[0].filter((_, i) =>
    folders.every(
      (f) =>
        f.slice(0, i + 1).join("/") === folders[0].slice(0, i + 1).join("/"),
    ),
  );
  return parts.at(-1) || root.replaceAll("\\", "/").split("/").at(-1) || "";
}
export function selectRange(
  visible: Book[],
  selected: Set<string>,
  anchor: string | null,
  target: string,
  shift: boolean,
): Set<string> {
  const next = new Set(selected);
  const checked = !next.has(target);
  let paths = [target];
  if (shift && anchor) {
    const a = visible.findIndex((b) => b.filePath === anchor),
      b = visible.findIndex((b) => b.filePath === target);
    if (a >= 0 && b >= 0)
      paths = visible
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .map((b) => b.filePath);
  }
  paths.forEach((p) => (checked ? next.add(p) : next.delete(p)));
  return next;
}
