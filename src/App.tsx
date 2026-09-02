import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchPublishedBlogs, fetchBlogBySlug } from "./api";
import type { Blog } from "./types";
import { marked } from "marked";
import mermaid from "mermaid";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import DOMPurify from "dompurify";
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
  Copy,
  List,
} from "lucide-react";
import "./App.css";

marked.setOptions({
  breaks: true,
  gfm: true,
});

/** Shared heading id used by marked renderer and TOC — must stay in sync. */
function slugifyHeading(raw: string, idCounts: Record<string, number>): string {
  const text = raw
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#\s]+/, "")
    .trim();
  let id = text
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id) return "";
  if (idCounts[id]) {
    idCounts[id]++;
    id = `${id}-${idCounts[id]}`;
  } else {
    idCounts[id] = 1;
  }
  return id;
}

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  try {
    const isManual = localStorage.getItem("blog-theme-manual") === "true";
    const stored = localStorage.getItem("blog-theme");
    if (isManual && (stored === "light" || stored === "dark")) return stored;
  } catch {
    /* ignore */
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

/** In-page section anchor from the URL hash (e.g. #best-practices -> "best-practices"). */
function getRouteSection(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  return hash || null;
}

export default function App() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [blogLoading, setBlogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [shareCopied, setShareCopied] = useState(false);
  const [copyMDCopied, setCopyMDCopied] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [tocPanelOpen, setTocPanelOpen] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLElement>(null);
  const activeHeadingRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("blog-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        const isManual = localStorage.getItem("blog-theme-manual") === "true";
        if (!isManual) {
          setTheme(e.matches ? "light" : "dark");
        }
      } catch {
        /* ignore */
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Fetch blogs list once on mount
  useEffect(() => {
    async function loadBlogs() {
      try {
        setLoading(true);
        const data = await fetchPublishedBlogs();
        setBlogs(data);
      } catch (err) {
        setError("Failed to load developer blogs. Please check back later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadBlogs();
  }, []);

  // Load only the selected article when a slug is in the path.
  useEffect(() => {
    let cancelled = false;

    async function resolveBlog() {
      if (!slug) {
        setSelectedBlog(null);
        return;
      }
      if (selectedBlog && selectedBlog.slug === slug) {
        return;
      }

      try {
        setBlogLoading(true);
        const blog = await fetchBlogBySlug(slug);
        if (!cancelled) setSelectedBlog(blog);
      } catch {
        // Prefer a fresh slug fetch; fall back to the published list cache.
        const match = blogs.find((b) => b.slug === slug) ?? null;
        if (!cancelled) setSelectedBlog(match);
      } finally {
        if (!cancelled) setBlogLoading(false);
      }
    }

    void resolveBlog();
    return () => {
      cancelled = true;
    };
  }, [slug, blogs, selectedBlog]);

  // In-article anchor clicks: scroll to the heading without reloading.
  useEffect(() => {
    const handleHashChange = () => {
      const section = getRouteSection();
      if (!section) return;
      const el = document.getElementById(section);
      if (el) el.scrollIntoView({ block: "start", behavior: "instant" });
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const selectBlog = (blog: Blog) => {
    navigate(`/${blog.slug}`);
    document
      .querySelector(".blog-reader-pane")
      ?.scrollTo({ top: 0, behavior: "instant" });
    if (window.innerWidth <= 868) {
      setSidebarOpen(false);
    }
  };

  const goHome = () => {
    navigate("/");
    document
      .querySelector(".blog-reader-pane")
      ?.scrollTo({ top: 0, behavior: "instant" });
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

    // Keep heading ids in sync with the TOC extractor (including duplicates).
    const headingIdCounts: Record<string, number> = {};
    renderer.heading = function ({ text, depth }) {
      const id = slugifyHeading(text, headingIdCounts);
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    };

    renderer.code = function ({ text, lang }) {
      const escapeTest = /[&<>"']/g;
      const escapeMap: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      const cleanText = text.replace(escapeTest, (m) => escapeMap[m]);

      if (lang === "mermaid") {
        return `<div class="mermaid-container"><div class="mermaid-actions"><button class="copy-mermaid-code" data-code="${encodeURIComponent(text)}">Copy Code</button><button class="copy-mermaid-img">Copy Image</button></div><div class="mermaid-wrapper" data-mermaid-code="${encodeURIComponent(text)}"><div class="mermaid-unprocessed">${cleanText}</div></div></div>`;
      }

      return `<div class="code-block-wrapper"><button class="copy-code-btn" data-code="${encodeURIComponent(text)}">Copy Code</button><pre><code class="language-${lang || "text"}">${cleanText}</code></pre></div>`;
    };

    return marked.parse(rawMarkdown, { renderer }) as string;
    // Stabilize on content identity — new selectedBlog object refs must not
    // rebuild HTML (that wipes rendered Mermaid SVGs via React/DOM resets).
  }, [selectedBlog?.id, selectedBlog?.content]);

  const sanitizedHtml = useMemo(() => {
    if (!htmlContent) return "";
    return DOMPurify.sanitize(htmlContent, {
      ADD_ATTR: ["data-code", "data-raw-code", "data-mermaid-code"],
    });
  }, [htmlContent]);

  const markdownRef = useRef<HTMLDivElement>(null);
  const appliedHtmlRef = useRef<string>("");
  const prevThemeRef = useRef(theme);

  // Apply HTML only when the string changes, then render Mermaid once.
  // Avoids dangerouslySetInnerHTML re-commits wiping SVGs.
  useLayoutEffect(() => {
    const root = markdownRef.current;
    if (!root || !selectedBlog || blogLoading) return;

    let cancelled = false;

    const renderMermaidIn = async (host: HTMLElement) => {
      const nodes = [...host.querySelectorAll(".mermaid-unprocessed")];
      if (!nodes.length) return;

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

      // Snapshot code first so DOM replacements cannot invalidate the list.
      const jobs = nodes.map((node, i) => ({
        node: node as HTMLElement,
        code: (node.textContent || "").trim(),
        i,
      }));

      for (const { node, code, i } of jobs) {
        if (cancelled || !code) continue;
        if (!document.body.contains(node)) continue;
        const wrapper = node.parentElement;
        if (!wrapper) continue;

        try {
          const id = `mermaid-render-${i}-${Date.now()}`;
          const { svg } = await mermaid.render(id, code);
          if (cancelled || !document.body.contains(wrapper)) continue;
          wrapper.innerHTML = `<div class="mermaid-svg-wrapper" data-raw-code="${encodeURIComponent(code)}">${svg}</div>`;
        } catch (renderErr) {
          console.error("Mermaid render error:", renderErr);
          if (!cancelled && document.body.contains(wrapper)) {
            wrapper.innerHTML = `<div class="mermaid-error">Diagram render error. Please reload.</div>`;
          }
        }
      }

      if (!cancelled) {
        document
          .querySelector(".blog-reader-pane")
          ?.dispatchEvent(new Event("scroll"));
      }
    };

    const htmlChanged = appliedHtmlRef.current !== sanitizedHtml;
    const themeChanged = prevThemeRef.current !== theme;
    prevThemeRef.current = theme;

    if (htmlChanged) {
      appliedHtmlRef.current = sanitizedHtml;
      root.innerHTML = sanitizedHtml;
      // Wrap tables so wide grids scroll inside the article instead of
      // expanding the page (overflow-x: clip/hidden on the reader pane).
      root.querySelectorAll("table").forEach((table) => {
        if (table.parentElement?.classList.contains("table-scroll")) return;
        const wrap = document.createElement("div");
        wrap.className = "table-scroll";
        table.replaceWith(wrap);
        wrap.appendChild(table);
      });
      Prism.highlightAllUnder(root);
    } else if (themeChanged) {
      // Theme toggle: restore source into wrappers so diagrams re-color.
      root.querySelectorAll(".mermaid-wrapper").forEach((wrapper) => {
        const raw =
          wrapper.getAttribute("data-mermaid-code") ||
          wrapper
            .querySelector("[data-raw-code]")
            ?.getAttribute("data-raw-code") ||
          "";
        if (!raw) return;
        const code = decodeURIComponent(raw);
        wrapper.setAttribute("data-mermaid-code", encodeURIComponent(code));
        wrapper.innerHTML = `<div class="mermaid-unprocessed"></div>`;
        const node = wrapper.querySelector(".mermaid-unprocessed");
        if (node) node.textContent = code;
      });
    }

    void renderMermaidIn(root);

    return () => {
      cancelled = true;
    };
  }, [sanitizedHtml, selectedBlog?.id, blogLoading, theme]);

  // Scroll to the section anchor once the article (and mermaid diagrams) have
  // finished rendering. A single scrollIntoView after layout settles lands the
  // heading at the top (clamped by the pane's max scroll) without cascading.
  useEffect(() => {
    if (!selectedBlog || blogLoading) return;
    const section = getRouteSection();
    if (!section) return;

    let cancelled = false;
    let waited = 0;

    const doScroll = () => {
      if (cancelled) return;
      document
        .getElementById(section)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    };

    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById(section);
      const pending = document.querySelectorAll(".mermaid-unprocessed").length;
      waited += 200;
      if (el && pending === 0) {
        // Layout stable — short delay then a single, clamped scroll.
        setTimeout(doScroll, 400);
      } else if (waited < 8000) {
        setTimeout(tick, 200);
      } else {
        doScroll();
      }
    };

    const timer = setTimeout(tick, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedBlog, blogLoading, htmlContent]);

  useEffect(() => {
    if (!articleRef.current) return;
    const article = articleRef.current;

    const handleCopyClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest("button");

      if (!button) return;

      if (
        button.classList.contains("copy-code-btn") ||
        button.classList.contains("copy-mermaid-code")
      ) {
        const code = decodeURIComponent(button.getAttribute("data-code") || "");
        if (code) {
          try {
            await navigator.clipboard.writeText(code);
            const originalText = button.innerText;
            button.innerText = "Copied!";
            setTimeout(() => {
              button.innerText = originalText;
            }, 2000);
          } catch (err) {
            console.error("Failed to copy code", err);
          }
        }
      } else if (button.classList.contains("copy-mermaid-img")) {
        const container = button.closest(".mermaid-container");
        if (container) {
          const svgEl = container.querySelector("svg");
          if (svgEl) {
            try {
              // Determine the diagram's natural size (not the CSS-scaled display size).
              let natW = parseFloat(svgEl.getAttribute("width") || "");
              let natH = parseFloat(svgEl.getAttribute("height") || "");
              if ((!natW || !natH) && svgEl.viewBox && svgEl.viewBox.baseVal) {
                const vb = svgEl.viewBox.baseVal;
                if (vb.width && vb.height) {
                  natW = vb.width;
                  natH = vb.height;
                }
              }
              if (!natW || !natH) {
                const rect = svgEl.getBoundingClientRect();
                natW = rect.width;
                natH = rect.height;
              }
              if (!natW || !natH) {
                natW = 800;
                natH = 600;
              }

              // High-resolution rasterisation so the copy stays crisp on every
              // screen size. At least 3x (or 2x devicePixelRatio), capped to a
              // 4096px longest side to avoid oversized canvases.
              const dpr = window.devicePixelRatio || 1;
              let scale = Math.max(3, dpr * 2);
              const MAX_DIM = 4096;
              if (Math.max(natW, natH) * scale > MAX_DIM) {
                scale = MAX_DIM / Math.max(natW, natH);
              }

              // Clone and pin explicit dimensions + namespace so the SVG loads
              // standalone at its natural size.
              const clone = svgEl.cloneNode(true) as SVGGraphicsElement;
              clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
              clone.setAttribute("width", String(natW));
              clone.setAttribute("height", String(natH));

              const svgData = new XMLSerializer().serializeToString(clone);
              const base64Data = btoa(unescape(encodeURIComponent(svgData)));
              const imgDataUrl = `data:image/svg+xml;base64,${base64Data}`;
              const img = new Image();

              img.onload = async () => {
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(natW * scale);
                canvas.height = Math.round(natH * scale);
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.scale(scale, scale);
                ctx.fillStyle = theme === "dark" ? "#0f111a" : "#ffffff";
                ctx.fillRect(0, 0, natW, natH);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, natW, natH);
                // PNG is lossless — no quality loss from compression.
                canvas.toBlob(async (blob) => {
                  if (blob) {
                    try {
                      const item = new ClipboardItem({ "image/png": blob });
                      await navigator.clipboard.write([item]);
                      const originalText = target.innerText;
                      target.innerText = "Copied!";
                      setTimeout(() => {
                        target.innerText = originalText;
                      }, 2000);
                    } catch (err) {
                      console.error("Failed to copy image to clipboard", err);
                    }
                  }
                }, "image/png");
              };
              img.src = imgDataUrl;
            } catch (err) {
              console.error("Error generating image from SVG", err);
            }
          }
        }
      }
    };

    article.addEventListener("click", handleCopyClick);
    return () => article.removeEventListener("click", handleCopyClick);
  }, [htmlContent, theme]);

  // Intercept in-article anchor links (e.g. Table of Contents) and scroll the
  // reader pane directly, avoiding conflicts with native hash navigation.
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("#")) return;
      const id = href.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;

      e.preventDefault();
      if (window.location.hash !== href) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${href}`,
        );
      }
      // Single clamped scroll (mermaid is already rendered by the time a user
      // clicks a TOC link, so layout is stable).
      el.scrollIntoView({ block: "start", behavior: "instant" });
    };

    article.addEventListener("click", handleAnchorClick);
    return () => article.removeEventListener("click", handleAnchorClick);
  }, [htmlContent, selectedBlog, blogLoading]);

  // Build TOC from rendered HTML so ids always match the live DOM
  // (raw markdown extraction falsely picks up headings inside code fences).
  const headings = useMemo(() => {
    if (!htmlContent) return [];
    const doc = new DOMParser().parseFromString(htmlContent, "text/html");
    return [...doc.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .map((h) => ({
        id: h.id,
        text: (h.textContent || "").trim(),
        depth: Number(h.tagName[1]),
      }))
      .filter((h) => h.id && h.text);
  }, [htmlContent]);

  // Track active heading from what's in view; keep that TOC link centered
  useEffect(() => {
    if (!selectedBlog || headings.length === 0) return;

    activeHeadingRef.current = null;
    const ids = headings.map((h) => h.id);

    const scrollTocToActive = (id: string) => {
      const sticky = tocRef.current?.querySelector(
        ".toc-sticky",
      ) as HTMLElement | null;
      const link = tocRef.current?.querySelector(
        `a[href="#${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      if (!sticky || !link) return;

      // Position relative to the scroll container (avoid offsetTop/offsetParent quirks).
      const linkTop =
        sticky.scrollTop +
        (link.getBoundingClientRect().top - sticky.getBoundingClientRect().top);
      const target =
        linkTop - sticky.clientHeight / 2 + link.offsetHeight / 2;
      const maxScroll = Math.max(0, sticky.scrollHeight - sticky.clientHeight);
      // Instant — smooth races during main-pane scroll leave the active link
      // stuck at the bottom edge of the TOC.
      sticky.scrollTo({
        top: Math.max(0, Math.min(target, maxScroll)),
        behavior: "auto",
      });
    };

    let tocScrollRaf = 0;
    const handleScroll = () => {
      // Activate a heading once it reaches the mid-viewport band so the TOC
      // tracks the section title the reader can already see (not only after
      // that title has scrolled up near the header).
      const focusY = Math.round(window.innerHeight * 0.55);
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= focusY) {
          current = id;
        }
      }

      if (activeHeadingRef.current !== current) {
        activeHeadingRef.current = current;
        setActiveHeading(current);
        cancelAnimationFrame(tocScrollRaf);
        tocScrollRaf = requestAnimationFrame(() => scrollTocToActive(current));
      }
    };

    const pane = document.querySelector(".blog-reader-pane");
    if (!pane) return;

    pane.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      cancelAnimationFrame(tocScrollRaf);
      pane.removeEventListener("scroll", handleScroll);
    };
  }, [selectedBlog, headings]);

  useEffect(() => {
    setTocPanelOpen(false);
  }, [selectedBlog?.id]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setTocPanelOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  const handleCopyMD = async () => {
    if (!selectedBlog) return;
    try {
      await navigator.clipboard.writeText(selectedBlog.content);
      setCopyMDCopied(true);
      setTimeout(() => setCopyMDCopied(false), 2000);
    } catch {
      setCopyMDCopied(false);
    }
  };

  const toggleTheme = () => {
    try {
      localStorage.setItem("blog-theme-manual", "true");
    } catch {
      /* ignore */
    }
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

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

        <button
          type="button"
          className="blog-logo"
          onClick={goHome}
          aria-label="Go to home"
          title="Home"
        >
          <Terminal size={18} className="text-accent" aria-hidden="true" />
          <span>blog.arumugamg.com</span>
        </button>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm theme-toggle"
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            <span className="theme-toggle-label">
              {theme === "dark" ? "Light" : "Dark"}
            </span>
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
            <div className="article-layout">
              <article className="blog-article" ref={articleRef}>
                <header className="article-header">
                  <h1 className="article-title">{selectedBlog.title}</h1>

                  <div className="article-meta-row">
                    <div className="meta-item">
                      <Calendar size={14} aria-hidden="true" />
                      <span>
                        Published: {formatDate(selectedBlog.published_at)}
                      </span>
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

                  <div className="article-header-actions">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={handleCopyMD}
                      aria-label="Copy page content"
                    >
                      {copyMDCopied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copyMDCopied ? "Copied!" : "Copy Page"}</span>
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={handleShare}
                      aria-label="Copy link to share"
                    >
                      {shareCopied ? <Check size={14} /> : <Share2 size={14} />}
                      <span>{shareCopied ? "Copied!" : "Share"}</span>
                    </button>
                  </div>
                </header>

                <div className="markdown-body" ref={markdownRef} />

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
                  </div>
                </footer>
              </article>

              {headings.length > 1 && (
                <>
                  <button
                    type="button"
                    className="toc-mobile-toggle"
                    onClick={() => setTocPanelOpen((open) => !open)}
                    aria-expanded={tocPanelOpen}
                    aria-controls="article-toc"
                    aria-label={tocPanelOpen ? "Close on this page" : "On this page"}
                  >
                    {tocPanelOpen ? <X size={16} /> : <List size={16} />}
                    <span>On this page</span>
                  </button>
                  {tocPanelOpen && (
                    <button
                      type="button"
                      className="toc-backdrop"
                      aria-label="Close table of contents"
                      onClick={() => setTocPanelOpen(false)}
                    />
                  )}
                  <aside
                    id="article-toc"
                    className={`toc-sidebar${tocPanelOpen ? " toc-sidebar--open" : ""}`}
                    ref={tocRef}
                  >
                    <div className="toc-sticky">
                      <div className="toc-header">
                        <List size={14} className="toc-icon" />
                        <span>On this page</span>
                      </div>
                      <nav className="toc-links" aria-label="Table of contents">
                        {headings.map((h, i) => (
                          <a
                            key={i}
                            href={`#${h.id}`}
                            className={`toc-link toc-depth-${h.depth}${activeHeading === h.id ? " active" : ""}`}
                            aria-current={activeHeading === h.id ? "location" : undefined}
                            onClick={() => setTocPanelOpen(false)}
                          >
                            {h.text}
                          </a>
                        ))}
                      </nav>
                    </div>
                  </aside>
                </>
              )}
            </div>
          ) : loading ? (
            <div className="reader-loader" role="status">
              <span className="spinner large" aria-hidden="true" />
              <span>Loading published articles...</span>
            </div>
          ) : filteredBlogs.length === 0 ? (
            <div className="reader-empty-state">
              <BookOpen size={48} className="text-dim" aria-hidden="true" />
              <h2>
                {searchQuery ? "No matches found" : "No published blogs yet"}
              </h2>
              <p>
                {searchQuery
                  ? "Try a different search term."
                  : "New developer logs will appear here when published."}
              </p>
            </div>
          ) : (
            <div className="home-blog-grid-container">
              <div className="home-blog-header">
                <BookOpen
                  size={32}
                  className="text-accent"
                  aria-hidden="true"
                />
                <h2>Available Articles</h2>
              </div>
              <div className="home-blog-grid">
                {filteredBlogs.map((blog) => (
                  <button
                    key={blog.id}
                    type="button"
                    onClick={() => selectBlog(blog)}
                    className="home-blog-card"
                  >
                    <h3>{blog.title}</h3>
                    <div className="home-blog-meta">
                      <span className="meta-date">
                        <Calendar size={14} aria-hidden="true" />
                        <span>{formatDate(blog.published_at)}</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
