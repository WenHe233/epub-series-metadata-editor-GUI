import { describe, it, expect } from "vitest";
import {
  Book,
  dirty,
  numberBooks,
  reorder,
  majority,
  commonParent,
  selectRange,
  inFolder,
} from "./model";
const book = (name: string, seriesIndex = "", series = ""): Book => ({
  filePath: "/books/" + name,
  fileName: name.split("/").at(-1)!,
  relativePath: name,
  title: "",
  author: "",
  series,
  seriesIndex,
  seriesSource: null,
  fingerprint: "abc",
});
describe("editing model", () => {
  it("numbers in display order and continues after a decimal", () => {
    const books = [book("a/2.epub", "2.5"), book("a/1.epub"), book("b/3.epub")];
    const selected = new Set(books.slice(0, 2).map((b) => b.filePath));
    expect(
      numberBooks(books, selected, true).map((b) => b.seriesIndex),
    ).toEqual(["2.5", "3", ""]);
    expect(numberBooks(books, selected).map((b) => b.seriesIndex)).toEqual([
      "1",
      "2",
      "",
    ]);
  });
  it("only reorders within the actual parent directory", () => {
    const books = [
      book("a/same/a.epub"),
      book("a/same/b.epub"),
      book("b/same/c.epub"),
    ];
    expect(reorder(books, books[0].filePath, books[2].filePath)).toBe(books);
    expect(reorder(books, books[1].filePath, books[0].filePath)[0]).toBe(
      books[1],
    );
  });
  it("compares saved values and tracks invalid numbers", () => {
    expect(dirty(book("a", "1.0", " x "), book("a", "1", "x"))).toBe(false);
    expect(dirty(book("a", "1bad"), book("a", "1"))).toBe(true);
  });
  it("selects a visible range without hidden books", () => {
    const a = book("a"),
      b = book("b"),
      c = book("c");
    expect([
      ...selectRange(
        [a, b, c],
        new Set([a.filePath]),
        a.filePath,
        c.filePath,
        true,
      ),
    ]).toEqual([a.filePath, b.filePath, c.filePath]);
  });
  it("uses folder boundaries, common parent and stable majority", () => {
    const books = [
      book("a/x.epub", "", "A"),
      book("a/b/y.epub", "", "B"),
      book("a/z.epub", "", "A"),
    ];
    expect(inFolder(book("ab/z"), "a")).toBe(false);
    expect(commonParent(books, "/books")).toBe("a");
    expect(majority(books)).toBe("A");
  });
});
