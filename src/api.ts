import type { Blog } from "./types";

const API_BASE = "https://api.arumugamg.com";

/** Fetch all published blogs */
export async function fetchPublishedBlogs(): Promise<Blog[]> {
  const response = await fetch(`${API_BASE}/blogs?status=published`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<Blog[]>;
}

/** Fetch a single blog by its slug */
export async function fetchBlogBySlug(slug: string): Promise<Blog> {
  const response = await fetch(`${API_BASE}/blogs/slug/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<Blog>;
}
