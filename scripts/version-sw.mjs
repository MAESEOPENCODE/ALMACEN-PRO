import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const outputDirectory = resolve("dist");
const placeholder = "__SALSA_BUILD_ID__";

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat().sort();
}

const files = await listFiles(outputDirectory);
if (files.length === 0) throw new Error("No se han encontrado archivos en dist/.");

const hash = createHash("sha256");
for (const path of files) {
  const relativePath = relative(outputDirectory, path).split(sep).join("/");
  hash.update(relativePath);
  hash.update("\0");
  hash.update(await readFile(path));
  hash.update("\0");
}

const buildId = hash.digest("hex").slice(0, 16);
const workerPath = resolve(outputDirectory, "sw.js");
const worker = await readFile(workerPath, "utf8");
if (!worker.includes(placeholder)) {
  throw new Error("dist/sw.js no contiene la marca de build esperada.");
}

await writeFile(workerPath, worker.replaceAll(placeholder, buildId));
console.log(`Service worker versionado para este build: ${buildId}`);
