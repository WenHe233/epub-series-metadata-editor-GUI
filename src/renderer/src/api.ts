import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Book, SaveOptions, SaveResult, ScanResult } from "./model";
export const desktop = isTauri();
export const api = {
  openDirectory: () => invoke<string | null>("open_directory"),
  scan: (recursive: boolean) => invoke<ScanResult>("scan_epubs", { recursive }),
  save: (book: Book, options: SaveOptions) =>
    invoke<SaveResult>("save_epub", {
      request: {
        filePath: book.filePath,
        fingerprint: book.fingerprint,
        series: book.series,
        seriesIndex: book.seriesIndex,
        ...options,
      },
    }),
  version: () => invoke<string>("app_version"),
};
