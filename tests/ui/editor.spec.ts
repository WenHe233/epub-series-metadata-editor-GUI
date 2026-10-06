import { test, expect, Page } from "@playwright/test";
async function mock(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isTauri", { value: true });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      value: { unregisterListener: () => {} },
    });
    const names = ["Saga/01.epub", "Saga/02.epub", "Other/03.epub"];
    let books = names.map((name, i) => ({
      filePath: "/books/" + name,
      fileName: name.split("/").pop(),
      relativePath: name,
      title: "Book " + (i + 1),
      author: "Author",
      series: i < 2 ? "Saga" : "Other",
      seriesIndex: String(i + 1),
      seriesSource: "epub3",
      fingerprint: "hash" + i,
    }));
    let fail = true;
    const callbacks = new Map<number, Function>();
    let counter = 0;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: (fn: Function) => {
          callbacks.set(++counter, fn);
          return counter;
        },
        unregisterCallback: () => {},
        invoke: async (cmd: string, args: any) => {
          if (cmd === "open_directory") return "/books";
          if (cmd === "scan_epubs")
            return { books: structuredClone(books), errors: [] };
          if (cmd === "app_version") return "2.0.0";
          if (cmd === "plugin:event|listen") return 1;
          if (cmd === "save_epub") {
            const req = args.request;
            if (req.filePath.endsWith("02.epub") && fail) {
              fail = false;
              return {
                filePath: req.filePath,
                book: null,
                error: "Simulated write failure",
              };
            }
            books = books.map((b) =>
              b.filePath === req.filePath
                ? {
                    ...b,
                    series: req.series,
                    seriesIndex: req.seriesIndex,
                    fingerprint: b.fingerprint + "x",
                  }
                : b,
            );
            return {
              filePath: req.filePath,
              book: books.find((b) => b.filePath === req.filePath),
              error: null,
            };
          }
          return null;
        },
      },
    });
  });
}
test.beforeEach(async ({ page }) => {
  await mock(page);
  await page.goto("/");
});
test("batch edit, undo, partial save and retry", async ({ page }) => {
  await page.getByRole("button", { name: "Open folder" }).first().click();
  await expect(page.getByTestId("book-row")).toHaveCount(3);
  await page
    .getByRole("checkbox", { name: "Select all visible books" })
    .check();
  await page.getByLabel("Series name", { exact: true }).fill("New series");
  await page.getByRole("button", { name: "Apply series name" }).click();
  await expect(page.getByLabel("Series 01.epub", { exact: true })).toHaveValue(
    "New series",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Series 01.epub", { exact: true })).toHaveValue(
    "Saga",
  );
  await page.getByRole("button", { name: "Apply series name" }).click();
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Simulated write failure",
  );
  await expect(
    page.getByRole("button", { name: /Save changes/ }),
  ).toContainText("1");
  await page.getByRole("button", { name: /Save changes/ }).click();
  await expect(
    page.getByRole("button", { name: /Save changes/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByLabel("Series 02.epub", { exact: true })).toHaveValue(
    "New series",
  );
});
test("filters, shift selection, numbering, unsaved dialog and themes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open folder" }).first().click();
  await page.locator('.folder-name[title="Saga"]').click();
  await expect(page.getByTestId("book-row")).toHaveCount(2);
  await page
    .getByRole("checkbox", { name: "Select book 01.epub", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Select book 02.epub", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Number from 1" }).click();
  await page.getByLabel("No. 01.epub", { exact: true }).fill("2.5");
  await page.getByLabel("No. 01.epub", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Continue numbering" }).click();
  await expect(page.getByLabel("No. 02.epub", { exact: true })).toHaveValue(
    "3",
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "EPUB 系列编辑器" }),
  ).toBeVisible();
  await page.screenshot({ path: ".artifacts/ui-dark.png", fullPage: true });
  await page.getByRole("button", { name: "切换主题" }).click();
  await page.screenshot({ path: ".artifacts/ui-light.png", fullPage: true });
});
