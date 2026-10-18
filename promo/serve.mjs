#!/usr/bin/env node
// Builds promo/promo.js and serves it on http://localhost:3003. The page
// renders the video and POSTs the MP4 back here, saved to promo/out/.
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { build } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const PORT = 3003;
const types = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2", ".png": "image/png" };

// Rebuilt on every page load, so edits show up on refresh.
const bundle = () =>
  build({
    entryPoints: [join(root, "promo/promo.js")],
    bundle: true,
    format: "esm",
    outfile: join(root, "promo/dist/promo.js"),
    logLevel: "warning",
  });

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (req.method === "POST" && path === "/save") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await mkdir(join(root, "promo/out"), { recursive: true });
    const file = join(root, "promo/out/randollm-promo.mp4");
    await writeFile(file, Buffer.concat(chunks));
    res.end("promo/out/randollm-promo.mp4");
    console.log(`saved ${file}`);
    return;
  }
  if (path === "/promo.js") await bundle();
  const file =
    path === "/" ? "promo/index.html" : path === "/promo.js" ? "promo/dist/promo.js" : normalize(join("public", path));
  if (!file.startsWith("promo/") && !file.startsWith("public/")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(join(root, file));
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`promo on http://localhost:${PORT}`));
