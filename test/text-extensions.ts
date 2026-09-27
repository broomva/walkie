/**
 * Text files the repo-wide scans read. Binary blobs (.pen, .png) are not
 * scanned. Shared so every scan covers the same set: two copies of this list
 * drift, and the scan with the shorter one silently stops seeing a file type.
 */
export const TEXT_EXTENSIONS = [
  ".md",
  ".html",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".ts",
  ".sh",
  ".glsl",
  ".swift",
];
