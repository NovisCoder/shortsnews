import { build as viteBuild } from "vite";
import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const clientDir = path.resolve(rootDir, "client");
const distDir = path.resolve(rootDir, "dist");

async function buildAll() {
  await rm(distDir, { recursive: true, force: true });

  console.log("building client...");
  await viteBuild({
    root: clientDir,
    base: "/shortsnews/",
    build: {
      outDir: distDir,
      emptyOutDir: true,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
