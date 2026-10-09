import type { APIRoute } from "astro";
import { spriteSvg } from "@/components/ui/TechIcon";

// Static at build time: dist/icons.svg holds every technology logo once.
export const GET: APIRoute = () => new Response(spriteSvg(), { headers: { "Content-Type": "image/svg+xml" } });
