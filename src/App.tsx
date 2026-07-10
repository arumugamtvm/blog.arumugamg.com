import { useState, useEffect, useMemo, useRef } from "react";
import { fetchPublishedBlogs, fetchBlogBySlug } from "./api";
import type { Blog } from "./types";
import { marked } from "marked";
import mermaid from "mermaid";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import {
  BookOpen,
  Calendar,
  Clock,
  Search,
  Terminal,
  Cpu,
  Menu,
  X,
  Share2,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import "./App.css";

marked.setOptions({
  breaks: true,
  gfm: true,
});

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem("blog-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export default function App() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [blogLoading, setBlogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [shareCopied, setShareCopied] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("blog-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    async function loadBlogs() {
      try {
        setLoading(true);
        const data = await fetchPublishedBlogs();
        setBlogs(data);

        const hash = window.location.hash.slice(1);
        if (hash) {
          const match = data.find((b) => b.slug === hash);
          if (match) setSelectedBlog(match);
        } else if (data.length > 0) {
          setSelectedBlog(data[0]);
        }
      } catch (err) {
        setError("Failed to load developer blogs. Please check back later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadBlogs();
  }, []);

  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;

      const matched = blogs.find((b) => b.slug === hash);
      if (matched) {
        setSelectedBlog(matched);
      } else {
        try {
          setBlogLoading(true);
          const blog = await fetchBlogBySlug(hash);
          setSelectedBlog(blog);
        } catch {
          /* ignore */
        } finally {
          setBlogLoading(false);
        }
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [blogs]);

  const selectBlog = (blog: Blog) => {
    window.location.hash = blog.slug;
    setSelectedBlog(blog);
    if (window.innerWidth <= 868) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (!articleRef.current) return;
      const element = articleRef.current;
      const totalHeight = element.clientHeight - window.innerHeight;
      if (totalHeight <= 0) {
        setScrollProgress(100);
        return;
      }
      const scrollPos = window.scrollY - element.offsetTop;
      const progress = (scrollPos / totalHeight) * 100;
      setScrollProgress(Math.min(100, Math.max(0, progress)));
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [selectedBlog, blogLoading]);

  useEffect(() => {
    if (!selectedBlog || blogLoading) return;

    Prism.highlightAll();

    const renderMermaid = async () => {
      try {
        const isLight = theme === "light";
        mermaid.initialize({
          startOnLoad: false,
          theme: isLight ? "default" : "dark",
          securityLevel: "loose",
          themeVariables: isLight
            ? {
                background: "#ffffff",
                primaryColor: "#4f46e5",
                primaryTextColor: "#0f172a",
                lineColor: "#6366f1",
              }
            : {
                background: "#0f111a",
                primaryColor: "#6366f1",
                primaryTextColor: "#f0f3ff",
                lineColor: "#8b5cf6",
              },
        });

        const containers = document.querySelectorAll(".mermaid-raw");
        for (let i = 0; i < containers.length; i++) {
          const container = containers[i] as HTMLElement;
          const code = container.innerText.trim();
          const id = `mermaid-render-${i}-${Date.now()}`;

          try {
            const { svg } = await mermaid.render(id, code);
            const wrapper = container.parentElement;
            if (wrapper) {
              wrapper.innerHTML = `<div class="mermaid-svg-wrapper">${svg}</div>`;
            }
          } catch (renderErr) {
            console.error("Mermaid render error:", renderErr);
            container.innerHTML = `<div class="mermaid-error">Diagram render error</div>`;
          }
        }
      } catch (err) {
        console.error("Mermaid initialization failed:", err);
      }
    };

    const timer = setTimeout(renderMermaid, 150);
    return () => clearTimeout(timer);
  }, [selectedBlog, blogLoading, theme]);

  const readingTime = useMemo(() => {
    if (!selectedBlog) return 1;
    const words = selectedBlog.content.split(/\s+/).length;
    return Math.max(1, Math.round(words / 220));
  }, [selectedBlog]);

  const filteredBlogs = useMemo(() => {
    return blogs.filter((blog) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        blog.title.toLowerCase().includes(query) ||
        blog.content.toLowerCase().includes(query)
      );
    });
  }, [blogs, searchQuery]);

  const htmlContent = useMemo(() => {
    if (!selectedBlog) return "";

    const rawMarkdown = selectedBlog.content;
    const renderer = new marked.Renderer();
    renderer.code = function ({ text, lang }) {
      if (lang === "mermaid") {
        return `<pre class="mermaid-wrapper"><div class="mermaid-raw">${text}</div></pre>`;
      }
      const escapeTest = /[&<>"']/g;
      const escapeMap: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      const cleanText = text.replace(escapeTest, (m) => escapeMap[m]);
      return `<pre><code class="language-${lang || "text"}">${cleanText}</code></pre>`;
    };

    return marked.parse(rawMarkdown, { renderer }) as string;
  }, [selectedBlog]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Draft";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(false);
    }
  };

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="blog-app-shell">
      {selectedBlog && !blogLoading && (
        <div
          className="reading-progress-bar"
          style={{ width: `${scrollProgress}%` }}
          role="progressbar"
          aria-valuenow={Math.round(scrollProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Reading progress"
        />
      )}

      <header className="blog-global-header">
        <button
          className="btn btn-ghost sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="blog-logo">
          <Terminal size={18} className="text-accent" aria-hidden="true" />
          <span>blog.arumugamg.com</span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>
      </header>

      <div className="blog-grid-layout">
        <aside
          className={`blog-sidebar ${sidebarOpen ? "open" : "closed"}`}
          aria-label="Article list"
        >
          <div className="sidebar-search">
            <Search size={16} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              aria-label="Search articles"
            />
          </div>

          <div className="sidebar-header">
            <h3>Recent Articles</h3>
            <span className="count-badge">{filteredBlogs.length}</span>
          </div>

          {loading ? (
            <div className="sidebar-loader" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>Fetching posts...</span>
            </div>
          ) : filteredBlogs.length === 0 ? (
            <div className="sidebar-empty">
              {searchQuery ? "No matches found." : "No published blogs yet."}
            </div>
          ) : (
            <nav className="blog-list-nav" aria-label="Published articles">
              {filteredBlogs.map((blog) => {
                const isSelected = selectedBlog?.id === blog.id;
                return (
                  <button
                    key={blog.id}
                    onClick={() => selectBlog(blog)}
                    className={`blog-nav-item ${isSelected ? "active" : ""}`}
                    aria-current={isSelected ? "page" : undefined}
                  >
                    <div className="nav-item-title">{blog.title}</div>
                    <div className="nav-item-meta">
                      <span className="meta-date">
                        <Calendar size={10} aria-hidden="true" />
                        <span>{formatDate(blog.published_at)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        <main className="blog-reader-pane" id="main-content">
          {blogLoading ? (
            <div className="reader-loader" role="status">
              <span className="spinner large" aria-hidden="true" />
              <span>Loading article content...</span>
            </div>
          ) : error ? (
            <div className="reader-empty-state" role="alert">
              <BookOpen size={48} className="text-dim" aria-hidden="true" />
              <h2>Error Loading Blogs</h2>
              <p>{error}</p>
            </div>
          ) : selectedBlog ? (
            <article className="blog-article" ref={articleRef}>
              <header className="article-header">
                <h1 className="article-title">{selectedBlog.title}</h1>

                <div className="article-meta-row">
                  <div className="meta-item">
                    <Calendar size={14} aria-hidden="true" />
                    <span>Published: {formatDate(selectedBlog.published_at)}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={14} aria-hidden="true" />
                    <span>{readingTime} min read</span>
                  </div>
                  <div className="meta-item text-accent">
                    <Cpu size={14} aria-hidden="true" />
                    <span>Developer Post</span>
                  </div>
                </div>
              </header>

              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />

              <footer className="article-footer">
                <div className="divider" />
                <div className="footer-flex">
                  <div className="author-badge">
                    <div className="avatar" aria-hidden="true">
                      AG
                    </div>
                    <div className="author-info">
                      <strong>Arumugam G</strong>
                      <p>Software Engineer & Systems Architect</p>
                    </div>
                  </div>
                  <div className="footer-actions">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={handleShare}
                      aria-label="Copy link to share"
                    >
                      {shareCopied ? <Check size={13} /> : <Share2 size={13} />}
                      <span>{shareCopied ? "Copied" : "Share"}</span>
                    </button>
                  </div>
                </div>
              </footer>
            </article>
          ) : (
            <div className="reader-empty-state">
              <BookOpen size={48} className="text-dim" aria-hidden="true" />
              <h2>No Article Selected</h2>
              <p>Choose one of the developer logs from the sidebar list to start reading.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
