// @ts-check
import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://gvitolo.vercel.app",
  integrations: [solid()],
  vite: { plugins: [tailwindcss()] },
  // One page: inlining the CSS removes the only render-blocking request.
  build: { inlineStylesheets: "always" },
});
