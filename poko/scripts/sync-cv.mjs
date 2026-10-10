import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = "https://raw.githubusercontent.com/gvitolocs/myresume/main/Giuseppe_Vitolo_EN.pdf";
const response = await fetch(source);
if (!response.ok) throw new Error(`CV download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.subarray(0, 5).toString() !== "%PDF-") {
  throw new Error("CV download did not return a PDF");
}
const directory = new URL("../public/", import.meta.url);
await mkdir(directory, { recursive: true });
const destination = new URL("cv.pdf", directory);
await writeFile(destination, bytes);
console.log(`Updated ${fileURLToPath(destination)} (${bytes.length} bytes)`);
