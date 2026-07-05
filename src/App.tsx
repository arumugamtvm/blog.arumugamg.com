import { useState, useEffect, useMemo, useRef } from "react";
import { fetchPublishedBlogs, fetchBlogBySlug } from "./api";
import type { Blog } from "./types";
import { marked } from "marked";
import mermaid from "mermaid";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css"; // Premium dark code theme
import { BookOpen, Calendar, Clock, Search, Terminal, Cpu, ArrowRight, Menu, X, Share2 } from "lucide-react";
import "./App.css";

// Configure marked with custom options
marked.setOptions({
  breaks: true,
  gfm: true,
});

export default function App() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [blogLoading, setBlogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Reading Progress State
  const [scrollProgress, setScrollProgress] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);

  // Load list of blogs
  useEffect(() => {
    async function loadBlogs() {
      try {
        setLoading(true);
        const data = await fetchPublishedBlogs();
        setBlogs(data);
        
        // Auto-select first blog if URL doesn't specify one
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

  // Listen to URL hash changes for deep linking
  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      
      const matched = blogs.find((b) => b.slug === hash);
      if (matched) {
        setSelectedBlog(matched);
      } else {
        // If not in preloaded list, fetch directly from api
        try {
          setBlogLoading(true);
          const blog = await fetchBlogBySlug(hash);
          setSelectedBlog(blog);
        } catch {
          // ignore
        } finally {
          setBlogLoading(false);
        }
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [blogs]);

  // Update hash when selected blog changes
  const selectBlog = (blog: Blog) => {
    window.location.hash = blog.slug;
    setSelectedBlog(blog);
    if (window.innerWidth <= 868) {
      setSidebarOpen(false); // Close sidebar on mobile
    }
  };

  // Calculate reading progress scroll bar
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

  // Mermaid and PrismJS side effects on content render
  useEffect(() => {
    if (!selectedBlog || blogLoading) return;
    
    // 1. Highlight all code syntax
    Prism.highlightAll();

    // 2. Render Mermaid diagrams
    const renderMermaid = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          themeVariables: {
            background: "#0f111a",
            primaryColor: "#6366f1",
            primaryTextColor: "#f0f3ff",
            lineColor: "#8b5cf6",
          }
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
            container.innerHTML = `<div class="mermaid-error">⚠️ Diagram render error</div>`;
          }
        }
      } catch (err) {
        console.error("Mermaid initialization failed:", err);
      }
    };

    // Small delay to ensure React updated the DOM
    const timer = setTimeout(renderMermaid, 150);
    return () => clearTimeout(timer);
  }, [selectedBlog, blogLoading]);

  // Compute read time
  const readingTime = useMemo(() => {
    if (!selectedBlog) return 1;
    const words = selectedBlog.content.split(/\s+/).length;
    return Math.max(1, Math.round(words / 220));
  }, [selectedBlog]);

  // Filtered blogs based on search queries
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

  // Dynamic custom Markdown renderer with support for Mermaid raw blocks
  const htmlContent = useMemo(() => {
    if (!selectedBlog) return "";
    
    const rawMarkdown = selectedBlog.content;
    
    // Custom marked renderer to capture mermaid blocks
    const renderer = new marked.Renderer();
    renderer.code = function ({ text, lang }) {
      if (lang === "mermaid") {
        return `<pre class="mermaid-wrapper"><div class="mermaid-raw">${text}</div></pre>`;
      }
      const escapeTest = /[&<>"']/g;
      const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      const cleanText = text.replace(escapeTest, (m) => escapeMap[m as keyof typeof escapeMap]);
      return `<pre><code class="language-${lang || "text"}">${cleanText}</code></pre>`;
    };

    return marked.parse(rawMarkdown, { renderer }) as string;
  }, [selectedBlog]);

  // Formatted date string helper
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

  return (
    <div className="blog-app-shell">
      {/* Scroll indicator for reading */}
      {selectedBlog && !blogLoading && (
        <div 
          className="reading-progress-bar" 
          style={{ width: `${scrollProgress}%` }}
          aria-hidden="true"
        />
      )}

      {/* ── Top Bar ── */}
      <header className="blog-global-header">
        <button 
          className="btn btn-ghost sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        
        <div className="blog-logo">
          <Terminal size={18} className="text-accent" />
          <span>blog.arumugamg.com</span>
        </div>

        <div className="header-actions">
          <a href="https://app.arumugamg.com" className="btn btn-ghost btn-sm btn-nav">
            <span>Dashboard</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* ── Main Container ── */}
      <div className="blog-grid-layout">
        
        {/* ── Sidebar: Blog listing ── */}
        <aside className={`blog-sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="sidebar-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="sidebar-header">
            <h3>Recent Articles</h3>
            <span className="count-badge">{filteredBlogs.length}</span>
          </div>

          {loading ? (
            <div className="sidebar-loader">
              <span className="spinner" />
              <span>Fetching posts...</span>
            </div>
          ) : filteredBlogs.length === 0 ? (
            <div className="sidebar-empty">
              {searchQuery ? "No matches found." : "No published blogs yet."}
            </div>
          ) : (
            <nav className="blog-list-nav">
              {filteredBlogs.map((blog) => {
                const isSelected = selectedBlog?.id === blog.id;
                return (
                  <button
                    key={blog.id}
                    onClick={() => selectBlog(blog)}
                    className={`blog-nav-item ${isSelected ? "active" : ""}`}
                  >
                    <div className="nav-item-title">{blog.title}</div>
                    <div className="nav-item-meta">
                      <span className="meta-date">
                        <Calendar size={10} />
                        <span>{formatDate(blog.published_at)}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        <main className="blog-reader-pane">
          {blogLoading ? (
            <div className="reader-loader">
              <span className="spinner large" />
              <span>Loading article content...</span>
            </div>
          ) : error ? (
            <div className="reader-empty-state">
              <BookOpen size={48} className="text-dim" />
              <h2>Error Loading Blogs</h2>
              <p>{error}</p>
            </div>
          ) : selectedBlog ? (
            <article className="blog-article" ref={articleRef}>
              
              {/* Article Header */}
              <header className="article-header">
                <h1 className="article-title">{selectedBlog.title}</h1>
                
                <div className="article-meta-row">
                  <div className="meta-item">
                    <Calendar size={14} />
                    <span>Published: {formatDate(selectedBlog.published_at)}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={14} />
                    <span>{readingTime} min read</span>
                  </div>
                  <div className="meta-item text-accent">
                    <Cpu size={14} />
                    <span>Developer Post</span>
                  </div>
                </div>
              </header>

              {/* Rendered HTML Markdown Body */}
              <div 
                className="markdown-body" 
                dangerouslySetInnerHTML={{ __html: htmlContent }} 
              />

              {/* Article Footer / Meta */}
              <footer className="article-footer">
                <div className="divider" />
                <div className="footer-flex">
                  <div className="author-badge">
                    <div className="avatar">AG</div>
                    <div className="author-info">
                      <strong>Arumugam G</strong>
                      <p>Software Engineer & Systems Architect</p>
                    </div>
                  </div>
                  <div className="footer-actions">
                    <button className="btn btn-ghost btn-xs" onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      alert("Link copied to clipboard!");
                    }}>
                      <Share2 size={13} />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </footer>
            </article>
          ) : (
            <div className="reader-empty-state">
              <BookOpen size={48} className="text-dim" />
              <h2>No Article Selected</h2>
              <p>Choose one of the developer logs from the sidebar list to start reading.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
