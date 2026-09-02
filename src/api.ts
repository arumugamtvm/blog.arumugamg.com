import type { Blog } from "./types";

/**
 * Resolve the API origin at request time.
 * Prefer VITE_API_BASE when set (local/dev). Otherwise derive
 * api.<domain> from a blog.<domain> reader host so the concrete
 * production host never appears in source.
 */
function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname.startsWith("blog.")) {
      return `${protocol}//api.${hostname.slice("blog.".length)}`;
    }
  }

  throw new Error(
    "Missing API base. Set VITE_API_BASE for local development.",
  );
}

/** Fetch all published blogs (index / sidebar list). */
export async function fetchPublishedBlogs(): Promise<Blog[]> {
  const response = await fetch(
    `${resolveApiBase()}/blogs?status=published`,
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<Blog[]>;
}

/** Fetch a single blog by its slug (article view). */
export async function fetchBlogBySlug(slug: string): Promise<Blog> {
  const response = await fetch(
    `${resolveApiBase()}/blogs/slug/${encodeURIComponent(slug)}`,
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<Blog>;
}
