// @ts-check
import { defineConfig } from "astro/config";

import { getSiteUrl } from "./src/config/site.ts";

export default defineConfig({
  site: getSiteUrl(),
  output: "static",
  server: {
    allowedHosts: ["www.kuku.mom", "kuku.mom"],
  },
  vite: {
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  },
});
