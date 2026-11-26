import { defineConfig } from "vite";

// Relative base so the built site works from any subpath. GitHub Pages serves
// this project from /particle-sandbox/, and an absolute "/assets/..." path
// would look for the files at the domain root and 404.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
