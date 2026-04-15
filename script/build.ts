import { build as viteBuild } from "vite";
import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

async function buildAll() {
  await rm(distDir, { recursive: true, force: true });

  console.log("📦 클라이언트 빌드 중...");
  await viteBuild({
    root: path.resolve(rootDir, "client"),
    base: "/",
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "client/src"),
        "@shared": path.resolve(rootDir, "shared"),
      },
    },
    build: {
      outDir: path.resolve(distDir, "public"),
      emptyOutDir: true,
    },
  });

  console.log("✅ 빌드 완료!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
