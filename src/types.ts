export interface Blog {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
