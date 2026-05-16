import { useCallback, useEffect, useRef, useState } from "react";

type FormatCategory = "PDF" | "DOCX" | "TXT" | "IMAGE";

type DocumentDto = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  formatCategory: FormatCategory;
  textContent: string;
  aiSummary: string | null;
  convertedFromId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Tab = "view" | "edit" | "chat" | "generate" | "export";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function getWordCount(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string, message?: string };
    return j.error || j.message || res.statusText;
  } catch {
    return res.statusText;
  }
}

function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("df-token"));
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authAdminKey, setAuthAdminKey] = useState("");

  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("view");
  const [editorText, setEditorText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("df-theme") || "light");

  // AI Chat & Generate state
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([]);
  const [genInstruction, setGenInstruction] = useState("");
  const [genResult, setGenResult] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandInput, setCommandInput] = useState("");

  // Smart Optimization State
  const [compression, setCompression] = useState<number>(0.8);
  const [resize, setResize] = useState<number>(1.0);
  const [showCompare, setShowCompare] = useState(false);
  const [previewOriginalUrl, setPreviewOriginalUrl] = useState<string | null>(null);
  const [previewOptimizedUrl, setPreviewOptimizedUrl] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // RBAC State
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);

  const selected = docs.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      if (e.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const runCommand = async () => {
    if (!commandInput.trim()) return;
    const rawInput = commandInput;
    setCommandOpen(false);
    setCommandInput("");
    setStatus("AI is interpreting your command...");

    try {
      const parseRes = await fetch("/api/documents/parse-command", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ command: rawInput }),
      });
      
      const intent = await parseRes.json();
      console.log("AI Intent:", intent);

      if (intent.error) {
        setBanner("AI Sense is currently unavailable. Please check your API key.");
        setStatus(null);
        return;
      }

      const { action, target, format, download, searchTerm } = intent;

      if (action === "CONVERT") {
        const targetFormat = format || "PDF";
        if (target === "ALL" || !selectedId) {
          setStatus(`Converting all docs to ${targetFormat}...`);
          for (const d of docs) {
            if (d.formatCategory.toString() !== targetFormat) {
              await fetch(`/api/documents/${d.id}/convert`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ format: targetFormat, compressionQuality: 0.8, resizeFactor: 1.0 }),
              });
            }
          }
          await loadDocs();
          setBanner(`Bulk conversion to ${targetFormat} completed!`);
        } else if (selectedId) {
          setStatus(`Converting to ${targetFormat}...`);
          const res = await fetch(`/api/documents/${selectedId}/convert`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ format: targetFormat, compressionQuality: 0.8, resizeFactor: 1.0 }),
          });
          if (res.ok) {
            const created = await res.json();
            await loadDocs();
            if (download) downloadFile(created.id, created.originalFilename);
            setSelectedId(created.id);
            setBanner(`Converted to ${targetFormat} successfully.`);
          }
        }
      } else if (action === "SUMMARIZE") {
        if (target === "ALL" || !selectedId) {
          setStatus("Summarizing everything...");
          for (const d of docs) {
            await fetch(`/api/documents/${d.id}/ai-summary`, { 
              method: "POST", headers: { "Authorization": `Bearer ${token}` } 
            });
          }
          await loadDocs();
          setBanner("All summaries generated!");
        } else if (selectedId) {
          await generateSummary();
        }
      } else if (action === "OPTIMIZE" && selectedId) {
        setStatus("Running AI Optimization...");
        await fetch(`/api/documents/${selectedId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ format: "PDF", compressionQuality: 0.4, resizeFactor: 0.5 }),
        });
        await loadDocs();
        setBanner("File optimized for web storage.");
      } else if (action === "SEARCH" && searchTerm) {
        const found = docs.find(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()));
        if (found) {
          setSelectedId(found.id);
          setTab("view");
          setBanner(`Found: ${found.title}`);
        } else {
          setBanner(`Could not find "${searchTerm}"`);
        }
      } else if (action === "THEME") {
        setTheme(rawInput.toLowerCase().includes("light") ? "light" : "dark");
      } else if (action === "LOGOUT") {
        logout();
      } else {
        setBanner("I understood the command but don't have a shortcut for it yet.");
      }
    } catch (err) {
      console.error(err);
      setBanner("Failed to process command with AI.");
    } finally {
      setStatus(null);
    }
  };

  useEffect(() => {
    if (token) {
      const payload = parseJwt(token);
      setUserRole(payload?.role || "USER");
    } else {
      setUserRole(null);
      setIsAdminPortal(false);
    }
  }, [token]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("df-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const logout = () => {
    localStorage.removeItem("df-token");
    setToken(null);
    setDocs([]);
    setSelectedId(null);
    setIsAdminPortal(false);
  };

  const loadDocs = useCallback(async (showStatus = false) => {
    if (!token) return;
    if (showStatus) setStatus("Refreshing library...");
    try {
      const res = await fetch("/api/documents", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 401) return logout();
      if (!res.ok) {
        setBanner(await parseError(res));
        setDocs([]);
        return;
      }
      setDocs(await res.json());
      if (showStatus) setBanner("Library updated.");
    } catch (e) {
      if (showStatus) setBanner("Refresh failed.");
    } finally {
      if (showStatus) setStatus(null);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      void loadDocs().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadDocs, token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      localStorage.setItem("df-token", urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(authMode === "login" ? "Logging in..." : "Creating account...");
    setBanner(null);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = authMode === "login" 
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, name: authName, adminKey: authAdminKey };
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(await parseError(res));
      
      const data = await res.json();
      if (authMode === "login") {
        localStorage.setItem("df-token", data.token);
        const payload = parseJwt(data.token);
        setUserRole(payload?.role || "USER");
        setToken(data.token);
        setAuthPassword("");
      } else {
        setBanner("Account created! Please login.");
        setAuthMode("login");
      }
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setStatus(null);
    }
  };

  const loadAdminData = async () => {
    if (!token || userRole !== "ADMIN") return;
    setStatus("Loading Admin Data...");
    try {
      const [uRes, sRes] = await Promise.all([
        fetch("/api/admin/users", { headers: { "Authorization": `Bearer ${token}` } }),
        fetch("/api/admin/stats", { headers: { "Authorization": `Bearer ${token}` } })
      ]);
      if (uRes.ok) setAdminUsers(await uRes.json());
      if (sRes.ok) setAdminStats(await sRes.json());
    } catch (e) {
      setBanner("Failed to load admin data.");
    } finally {
      setStatus(null);
    }
  };

  const clearAllDocuments = async () => {
    if (!window.confirm("☢️ NUCLEAR OPTION: This will delete ALL documents from the database and AWS S3 permanently. Are you absolutely sure?")) return;
    try {
      const res = await fetch("/api/admin/documents/clear-all", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        void loadAdminData();
        void loadDocs();
        setBanner("All cloud storage has been cleared successfully.");
      }
    } catch (e) {
      setBanner("Failed to clear storage.");
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
    setStatus("Deleting user...");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await parseError(res));
      setBanner("User deleted.");
      void loadAdminData();
    } catch (e) {
      setBanner("Delete failed.");
    } finally {
      setStatus(null);
    }
  };

  const wipeUserData = async (id: string) => {
    if (!confirm("Are you sure you want to WIPE all cloud storage for this user? Account remains active.")) return;
    setStatus("Wiping user data...");
    try {
      const res = await fetch(`/api/admin/users/${id}/clear-data`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await parseError(res));
      setBanner("User data wiped from cloud.");
      void loadAdminData();
    } catch (e) {
      setBanner("Wipe failed.");
    } finally {
      setStatus(null);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !token) return;
    const file = files[0];
    setStatus("Uploading...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/documents", { 
        method: "POST", 
        headers: { "Authorization": `Bearer ${token}` },
        body: fd 
      });
      if (!res.ok) throw new Error(await parseError(res));
      const created = (await res.json()) as DocumentDto;
      setSelectedId(created.id);
      setTab("view");
      await loadDocs();
    } catch (e) {
      setBanner("Upload failed.");
    } finally {
      setStatus(null);
    }
  };

  const saveText = async () => {
    if (!selectedId || !token) return;
    setStatus("Saving...");
    try {
      const res = await fetch(`/api/documents/${selectedId}/content`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ textContent: editorText }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const updated = (await res.json()) as DocumentDto;
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setBanner("Saved successfully.");
    } catch (e) {
      setBanner("Save failed.");
    } finally {
      setStatus(null);
    }
  };

  const generateSummary = async () => {
    if (!selectedId || !token) return;
    setStatus("AI summarizing...");
    try {
      const res = await fetch(`/api/documents/${selectedId}/ai-summary`, { 
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await parseError(res));
      const updated = (await res.json()) as DocumentDto;
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setBanner("Summary generated.");
    } catch (e) {
      setBanner("Summary failed.");
    } finally {
      setStatus(null);
    }
  };

  const askAi = async () => {
    if (!selectedId || !chatQuestion || !token) return;
    setStatus("AI thinking...");
    try {
      const res = await fetch(`/api/documents/${selectedId}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ question: chatQuestion }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json();
      setChatHistory((prev) => [...prev, { q: chatQuestion, a: data.answer }]);
      setChatQuestion("");
    } catch (e) {
      setBanner("Chat failed.");
    } finally {
      setStatus(null);
    }
  };

  const generateContent = async (instr: string) => {
    if (!selectedId || !instr || !token) return;
    setStatus("AI enhancing...");
    try {
      const res = await fetch(`/api/documents/${selectedId}/generate`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ instruction: instr }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json();
      setGenResult(data.content);
    } catch (e) {
      setBanner("Generation failed.");
    } finally {
      setStatus(null);
    }
  };

  const applyEnhancement = () => {
    if (!genResult) return;
    setEditorText(genResult);
    setGenResult(null);
    setTab("edit");
    setBanner("AI enhancement applied. Don't forget to save!");
  };

  const runOcr = async () => {
    if (!selectedId || !token) return;
    setStatus("AI Vision OCR...");
    try {
      const res = await fetch(`/api/documents/${selectedId}/ai-ocr`, { 
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await parseError(res));
      const updated = (await res.json()) as DocumentDto;
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setBanner("OCR completed.");
    } catch (e) {
      setBanner("OCR failed.");
    } finally {
      setStatus(null);
    }
  };

  const convertTo = async (format: "PDF" | "DOCX" | "TXT") => {
    if (!selectedId || !token) return;
    setStatus(`Converting to ${format}...`);
    try {
      const res = await fetch(`/api/documents/${selectedId}/convert`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          format, 
          compressionQuality: compression, 
          resizeFactor: resize 
        }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const created = (await res.json()) as DocumentDto;
      await loadDocs();
      setSelectedId(created.id);
      setTab("view");
      setBanner(`Converted to ${format} successfully.`);
    } catch (e) {
      setBanner("Conversion failed.");
    } finally {
      setStatus(null);
    }
  };

  const removeDoc = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    setStatus("Deleting...");
    try {
      const res = await fetch(`/api/documents/${id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await parseError(res));
      if (selectedId === id) setSelectedId(null);
      await loadDocs();
      setBanner("Document deleted.");
    } catch (e) {
      setBanner("Delete failed.");
    } finally {
      setStatus(null);
    }
  };

  const downloadFile = async (id: string, filename: string) => {
    if (!token) return;
    setStatus("Preparing Download...");
    try {
      const res = await fetch(`/api/documents/${id}/file?download=true`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("File download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setBanner("Download failed. The file might still be processing.");
    } finally {
      setStatus(null);
    }
  };

  const openComparison = async () => {
    if (!selectedId || !token) return;
    setCompareLoading(true);
    setShowCompare(true);
    try {
      // Original Preview
      const resOrig = await fetch(`/api/documents/${selectedId}/preview?compression=1.0&resize=1.0`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (resOrig.ok) {
        const blob = await resOrig.blob();
        setPreviewOriginalUrl(URL.createObjectURL(blob));
      }

      // Optimized Preview
      const resOpt = await fetch(`/api/documents/${selectedId}/preview?compression=${compression}&resize=${resize}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (resOpt.ok) {
        const blob = await resOpt.blob();
        setPreviewOptimizedUrl(URL.createObjectURL(blob));
      }
    } catch (e) {
      setBanner("Failed to load comparison preview.");
    } finally {
      setCompareLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewOriginalUrl) URL.revokeObjectURL(previewOriginalUrl);
      if (previewOptimizedUrl) URL.revokeObjectURL(previewOptimizedUrl);
    };
  }, [previewOriginalUrl, previewOptimizedUrl]);

  useEffect(() => {
    if (!selectedId || !selected || !token) {
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      return;
    }
    if (selected.formatCategory !== "PDF" && selected.formatCategory !== "IMAGE") {
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/documents/${selectedId}/file`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    })();
    return () => { cancelled = true; };
  }, [selectedId, selected?.formatCategory, token]);

  useEffect(() => {
    if (selected) setEditorText(selected.textContent ?? "");
  }, [selectedId, selected?.textContent]);

  if (!token) {
    return (
      <div className={`app-container theme-${theme}`}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&family=Outfit:wght@300;400;600;800&display=swap');`}</style>
        
        <div className="floating-container">
          <div className="hero-art"></div>
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>

        <div className="workspace" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", position: "relative", zIndex: 1 }}>
          {status && <div className="loading-overlay"><div className="spinner"></div></div>}
          <div className="ws-panel" style={{ width: "100%", maxWidth: "440px", padding: "3rem" }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <h1 className="ws-logo" style={{ fontSize: "3.5rem", marginBottom: "0.5rem" }}>
                <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>DocuFlex</span> AI
              </h1>
              <p className="ws-tagline" style={{ fontSize: "1.1rem" }}>{authMode === "login" ? "Welcome back to your workspace" : "Create your premium account"}</p>
            </div>

            {banner && (
              <div className={`ws-banner ${banner.toLowerCase().includes("fail") || banner.toLowerCase().includes("fetch") ? "" : "ws-banner--ok"}`} style={{ marginBottom: "2rem" }}>
                {banner.toLowerCase().includes("fetch") ? "Connection Error: Please ensure the backend server is running on port 8081." : banner}
              </div>
            )}

            <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {authMode === "register" && (
                <div className="input-group">
                  <label className="hint" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem", display: "block" }}>Full Name</label>
                  <input type="text" className="editor" style={{ minHeight: "auto", padding: "1rem", borderRadius: "12px" }} value={authName} onChange={(e) => setAuthName(e.target.value)} required placeholder="John Doe" />
                </div>
              )}
              <div className="input-group">
                <label className="hint" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem", display: "block" }}>Email Address</label>
                <input type="email" className="editor" style={{ minHeight: "auto", padding: "1rem", borderRadius: "12px" }} value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required placeholder="name@example.com" />
              </div>
              <div className="input-group">
                <label className="hint" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem", display: "block" }}>Password</label>
                <input type="password" className="editor" style={{ minHeight: "auto", padding: "1rem", borderRadius: "12px" }} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              {authMode === "register" && (
                <div className="input-group">
                  <label className="hint" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem", display: "block" }}>Admin Access Key (Optional)</label>
                  <input type="password" className="editor" style={{ minHeight: "auto", padding: "1rem", borderRadius: "12px" }} value={authAdminKey} onChange={(e) => setAuthAdminKey(e.target.value)} placeholder="Secret Key" />
                </div>
              )}
              <button type="submit" className="btn-primary" style={{ width: "100%", padding: "1.1rem", marginTop: "1rem", fontSize: "1rem" }}>
                {authMode === "login" ? "Sign In to Workspace" : "Create Account"}
              </button>
              
              <div style={{ position: "relative", textAlign: "center", margin: "1rem 0" }}>
                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />
                <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "var(--panel)", padding: "0 1rem", color: "var(--text)", fontSize: "0.85rem", opacity: 0.6 }}>OR</span>
              </div>

              <button 
                type="button" 
                className="btn-secondary" 
                style={{ width: "100%", padding: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", fontSize: "1rem" }}
                onClick={() => window.location.href = "/oauth2/authorization/google"}
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: "18px", height: "18px" }} />
                Sign In with Google
              </button>
            </form>
            <p className="muted centered" style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
              {authMode === "login" ? "Don't have an account yet?" : "Already have an account?"}{" "}
              <button type="button" className="linkish" style={{ fontSize: "0.95rem" }} onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setBanner(null); }}>
                {authMode === "login" ? "Register Now" : "Login Instead"}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container theme-${theme}`}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&family=Outfit:wght@300;400;600;800&display=swap');`}</style>
      
      <div className="floating-container">
        <div className="hero-art"></div>
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="workspace" style={{ position: "relative", zIndex: 1 }}>
        <input ref={fileRef} type="file" className="sr-only" onChange={(e) => void uploadFiles(e.target.files)} />
        
        {status && (
          <div className="loading-overlay">
            <div className="spinner" style={{ width: "50px", height: "50px", borderWidth: "3px" }}></div>
            <div className="status-text" style={{ fontSize: "1.1rem", fontWeight: 600, letterSpacing: "0.05em" }}>{status.toUpperCase()}</div>
          </div>
        )}
        
        <header className="ws-header">
          <div>
            <h1 className="ws-logo">
              <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>DocuFlex</span> AI
              <span className="pro-badge">PRO</span>
            </h1>
            <p className="ws-tagline" style={{ marginTop: "0.25rem", fontSize: "0.9rem", opacity: 0.8 }}>
              The Ultimate AI-Powered Document Workspace
            </p>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {userRole === "ADMIN" && (
              <button type="button" className={`btn-primary ${isAdminPortal ? "danger" : ""}`} onClick={() => { setIsAdminPortal(!isAdminPortal); if (!isAdminPortal) void loadAdminData(); }} style={{ padding: "0.5rem 1rem" }}>
                {isAdminPortal ? "Exit Admin Portal" : "👑 Admin Portal"}
              </button>
            )}
            <button type="button" className="linkish" onClick={() => setShowAbout(true)} style={{ marginRight: "1rem", fontWeight: 600 }}>
              About Us
            </button>
            <button type="button" className="theme-toggle" onClick={toggleTheme} title="Toggle Appearance">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => void loadDocs(true)} disabled={!!status}>
              Refresh
            </button>
            <button type="button" className="btn-secondary danger" onClick={logout} style={{ color: "var(--danger)" }}>
              Logout
            </button>
          </div>
        </header>

        {banner && (
          <div className={`ws-banner ${banner.toLowerCase().includes("fail") ? "" : "ws-banner--ok"}`} style={{ marginBottom: "1rem" }}>
            {banner}
          </div>
        )}

        <div className="ws-modular-grid">
          {isAdminPortal ? (
            <div className="ws-main-theater" style={{ gridColumn: "1 / -1" }}>
              <main className="ws-panel ws-main">
                <div className="view-area">
                  <h3 className="serif-title" style={{ fontSize: "2.5rem", marginBottom: "0.5rem", color: "var(--primary)" }}>👑 System Administration</h3>
                  <p className="muted" style={{ marginBottom: "2.5rem", fontSize: "1.2rem" }}>Master control panel for user monitoring and system stats.</p>
                  
                  <div className="dashboard-stats" style={{ marginBottom: "3rem", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2rem" }}>
                    <div className="stat-card" style={{ padding: "2rem" }}>
                      <p className="muted small uppercase" style={{ letterSpacing: "0.1em" }}>Total Users</p>
                      <h3 style={{ fontSize: "2.5rem" }}>{adminStats?.totalUsers || 0}</h3>
                    </div>
                    <div className="stat-card" style={{ padding: "2rem" }}>
                      <p className="muted small uppercase" style={{ letterSpacing: "0.1em" }}>Total Documents</p>
                      <h3 style={{ fontSize: "2.5rem" }}>{adminStats?.totalDocuments || 0}</h3>
                    </div>
                    <div className="stat-card" style={{ padding: "2rem" }}>
                      <p className="muted small uppercase" style={{ letterSpacing: "0.1em" }}>Storage Used</p>
                      <h3 style={{ fontSize: "2.5rem" }}>{formatBytes(adminStats?.totalStorageUsed || 0)}</h3>
                    </div>
                  </div>

                  <div className="ws-panel" style={{ background: "rgba(255,255,255,0.03)", padding: "2rem", border: "1px solid var(--border)" }}>
                    <h4 style={{ marginBottom: "1.5rem", fontSize: "1.5rem" }}>Active User Directory</h4>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--border)" }}>
                            <th style={{ padding: "1.5rem 1rem" }}>Member Name</th>
                            <th style={{ padding: "1.5rem 1rem" }}>Account Email</th>
                            <th style={{ padding: "1.5rem 1rem" }}>Cloud Storage</th>
                            <th style={{ padding: "1.5rem 1rem" }}>Access Level</th>
                            <th style={{ padding: "1.5rem 1rem", textAlign: "right" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map(u => (
                            <tr key={u.id} className="doc-row" style={{ borderBottom: "1px solid var(--border)", background: "transparent" }}>
                              <td style={{ padding: "1.5rem 1rem", fontWeight: 600 }}>{u.name}</td>
                              <td style={{ padding: "1.5rem 1rem" }} className="muted">{u.email}</td>
                              <td style={{ padding: "1.5rem 1rem" }}>
                                <span style={{ fontWeight: 600, color: u.storageUsed > 0 ? "var(--primary)" : "inherit" }}>
                                  {formatBytes(u.storageUsed || 0)}
                                </span>
                              </td>
                              <td style={{ padding: "1.5rem 1rem" }}>
                                <span className={`pill ${u.role === "ADMIN" ? "ws-banner--ok" : ""}`} style={{ fontSize: "0.8rem", padding: "0.4rem 1rem" }}>{u.role}</span>
                              </td>
                              <td style={{ padding: "1.5rem 1rem", textAlign: "right", display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                                <button className="linkish" onClick={() => void wipeUserData(u.id)} style={{ fontSize: "0.9rem" }}>🧹 Wipe Data</button>
                                <button className="linkish danger" onClick={() => void deleteUser(u.id)} disabled={u.role === "ADMIN"} style={{ fontSize: "0.9rem" }}>Revoke Access</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="ws-panel" style={{ background: "rgba(255,100,100,0.05)", padding: "2rem", border: "1px solid rgba(255,0,0,0.2)", marginTop: "2rem" }}>
                    <h4 style={{ marginBottom: "1rem", fontSize: "1.5rem", color: "#ff6b6b" }}>⚠️ Storage Master Control</h4>
                    <p className="muted" style={{ marginBottom: "1.5rem" }}>Permanently delete all documents from the database and sync removal with AWS S3.</p>
                    <button className="btn-primary danger" onClick={() => void clearAllDocuments()} style={{ padding: "1rem 2rem" }}>
                      Clear All Cloud Storage
                    </button>
                  </div>
                </div>
              </main>
            </div>
          ) : (
            <>
              <aside className="ws-sidebar">
                <div className="ws-panel">
                  <h2 id="lib-title" style={{ marginBottom: "1.25rem" }}>Library</h2>
                  {loading ? (
                    <p className="muted centered">Loading...</p>
                  ) : docs.length === 0 ? (
                    <p className="muted centered">No documents.</p>
                  ) : (
                    <ul className="doc-list">
                      {docs.map((d) => (
                        <li key={d.id}>
                          <button type="button" className={`doc-row ${d.id === selectedId ? "doc-row--active" : ""}`} onClick={() => setSelectedId(d.id)}>
                            <span className="doc-name">{d.title}</span>
                          </button>
                          <div className="doc-actions" style={{ padding: "0.5rem 1rem", display: "flex", gap: "1rem", justifyContent: "space-between" }}>
                            <button type="button" className="linkish" onClick={() => downloadFile(d.id, d.originalFilename)} style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <span>📥</span> Download
                            </button>
                            <button type="button" className="linkish danger" onClick={() => void removeDoc(d.id)} style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <span>🗑️</span> Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button className="btn-primary" style={{ width: "100%", marginTop: "1rem", padding: "1rem" }} onClick={() => fileRef.current?.click()}>
                    + New Upload
                  </button>
                </div>
              </aside>

              <div className="ws-main-theater">
                <main className="ws-panel ws-main" aria-labelledby="work-title">
                  <div className="ai-action-bar" style={{ marginBottom: "2rem", padding: "1.5rem", background: "var(--grad)", borderRadius: "20px", color: "#fff", boxShadow: "0 10px 30px rgba(245, 158, 11, 0.2)" }}>
                    <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>🪄</span> Magic AI Command Center
                    </h3>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <input 
                        className="editor" 
                        style={{ minHeight: "auto", flex: 1, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "1rem" }} 
                        placeholder="Try: 'Summarize, optimize and download as PDF'..."
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void runCommand()}
                      />
                      <button className="btn-primary" style={{ background: "#fff", color: "var(--primary)", minWidth: "120px" }} onClick={() => void runCommand()}>
                        Execute
                      </button>
                    </div>
                    <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", opacity: 0.9 }}>
                      The AI will autonomously process, summarize, and download your file based on your command.
                    </p>
                  </div>

                  <div className="ws-panel-head">
                    <h2 id="work-title" style={{ fontSize: "1.2rem" }}>{selected ? selected.originalFilename : "Command Center"}</h2>
                    {selected && (
                      <div className="tabs" role="tablist">
                        {(["view", "edit", "chat", "generate", "export"] as const).map((t) => (
                          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "tab--on" : ""}`} onClick={() => setTab(t)}>
                            {t.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!selected ? (
                    <div className="dashboard-view" style={{ textAlign: "center", padding: "4rem" }}>
                      <div className="dashboard-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "3rem" }}>
                        <div className="stat-card">
                          <p className="muted small uppercase">Docs</p>
                          <h3>{docs.length}</h3>
                        </div>
                        <div className="stat-card">
                          <p className="muted small uppercase">Words</p>
                          <h3>{docs.reduce((acc, d) => acc + getWordCount(d.textContent), 0)}</h3>
                        </div>
                        <div className="stat-card">
                          <p className="muted small uppercase">Size</p>
                          <h3>{formatBytes(docs.reduce((acc, d) => acc + d.sizeBytes, 0))}</h3>
                        </div>
                      </div>
                      <div className="empty-onboarding">
                        <div className="onboarding-art">✨</div>
                        <h2>Your Intelligent Document Command Center</h2>
                        <p className="muted" style={{ maxWidth: "500px", margin: "1rem auto 2rem", lineHeight: "1.6" }}>
                          DocuFlex AI transforms static files into interactive assets. 
                          <strong> Upload</strong> your documents to <strong>Chat</strong> with them, 
                          <strong> Summarize</strong> complex content, and <strong>Convert</strong> 
                          formats with smart AI optimization.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="workspace-content" style={{ marginTop: "1.5rem" }}>
                      {tab === "view" && (
                        <div className="view-area">
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "1rem" }}>
                            {selected.formatCategory === "IMAGE" && (
                              <button className="btn-secondary small" onClick={() => void runOcr()} disabled={!!status}>AI OCR</button>
                            )}
                            <button className="btn-primary small" onClick={() => void generateSummary()} disabled={!!status}>Summarize</button>
                          </div>
                          {selected.aiSummary && (
                            <div className="ws-banner ws-banner--ok" style={{ marginBottom: "1.5rem", background: "var(--primary-bg)", color: "var(--primary)" }}>
                              <h4 style={{ margin: "0 0 0.5rem 0" }}>✨ Summary</h4>
                              <p style={{ margin: 0, lineHeight: "1.6" }}>{selected.aiSummary}</p>
                            </div>
                          )}
                          {previewUrl ? (
                            <iframe src={previewUrl} style={{ width: "100%", height: "600px", border: "none", borderRadius: "12px" }} />
                          ) : (
                            <pre className="text-block" style={{ whiteSpace: "pre-wrap", background: "var(--border)", padding: "1.5rem", borderRadius: "12px" }}>{selected.textContent}</pre>
                          )}
                        </div>
                      )}
                      {tab === "edit" && (
                        <div className="edit-area">
                          <textarea className="editor" value={editorText} onChange={(e) => setEditorText(e.target.value)} style={{ height: "500px" }} />
                          <button className="btn-primary" style={{ marginTop: "1rem" }} onClick={() => void saveText()} disabled={!!status}>Save Changes</button>
                        </div>
                      )}
                      {tab === "chat" && (
                        <div className="view-area">
                          <div className="text-block" style={{ height: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {chatHistory.length === 0 && <p className="muted centered">Ask me anything about this file.</p>}
                            {chatHistory.map((h, i) => (
                              <div key={i}>
                                <p><strong>You:</strong> {h.q}</p>
                                <p style={{ color: "var(--primary)", background: "var(--primary-bg)", padding: "1rem", borderRadius: "12px" }}><strong>AI:</strong> {h.a}</p>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                            <input className="editor" style={{ minHeight: "auto", flex: 1 }} value={chatQuestion} onChange={(e) => setChatQuestion(e.target.value)} placeholder="Ask a question..." onKeyDown={(e) => e.key === "Enter" && void askAi()} />
                            <button className="btn-primary" onClick={() => void askAi()} disabled={!!status || !chatQuestion}>Ask</button>
                          </div>
                        </div>
                      )}
                      {tab === "generate" && (
                        <div className="view-area">
                          <h3 className="serif-title">AI Enhancement</h3>
                          <div style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
                            <input className="editor" style={{ minHeight: "auto", flex: 1 }} value={genInstruction} onChange={(e) => setGenInstruction(e.target.value)} placeholder="e.g. 'Make it professional'..." onKeyDown={(e) => e.key === "Enter" && void generateContent(genInstruction)} />
                            <button className="btn-primary" onClick={() => void generateContent(genInstruction)} disabled={!!status || !genInstruction}>Enhance</button>
                          </div>

                          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                            <button className="btn-secondary small" onClick={() => void generateContent("Rewrite for maximum clarity.")} disabled={!!status}>✨ Rewrite</button>
                            <button className="btn-secondary small" onClick={() => void generateContent("Make professional and executive.")} disabled={!!status}>👔 Professional</button>
                            <button className="btn-secondary small" onClick={() => void generateContent("Expand on existing content.")} disabled={!!status}>📝 Expand</button>
                            <button className="btn-secondary small" onClick={() => void generateContent("Summarize into key bullet points.")} disabled={!!status}>🎯 Key Takeaways</button>
                          </div>

                          {genResult && (
                            <div className="ws-panel" style={{ padding: "1.5rem", border: "1px solid var(--primary)" }}>
                              <pre style={{ whiteSpace: "pre-wrap", marginBottom: "1rem" }}>{genResult}</pre>
                              <button className="btn-primary" onClick={applyEnhancement}>Apply to Editor</button>
                            </div>
                          )}
                        </div>
                      )}
                      {tab === "export" && (
                        <div className="convert-area">
                          <div className="ws-panel" style={{ background: "var(--primary-bg)", padding: "1.5rem", marginBottom: "2rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                              <h3 className="serif-title" style={{ fontSize: "1.2rem", margin: 0 }}>Smart Optimization</h3>
                              <div style={{ display: "flex", gap: "1rem" }}>
                                <span className="pill" style={{ fontSize: "0.8rem", background: "var(--grad)", color: "#fff" }}>
                                  Est. Size: {selected ? formatBytes(selected.sizeBytes * compression * (resize * resize)) : "0 B"}
                                </span>
                                <span className="pill" style={{ fontSize: "0.8rem", background: "var(--border)" }}>
                                  Quality: {compression > 0.8 && resize > 0.8 ? "Excellent" : compression > 0.5 ? "Good" : "Fair"}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "1.5rem" }}>
                              <div>
                                <label className="hint">Compression: {Math.round(compression * 100)}%</label>
                                <input type="range" min="0.1" max="1.0" step="0.05" value={compression} onChange={(e) => setCompression(parseFloat(e.target.value))} style={{ width: "100%" }} />
                              </div>
                              <div>
                                <label className="hint">Resize: {Math.round(resize * 100)}%</label>
                                <input type="range" min="0.1" max="1.0" step="0.1" value={resize} onChange={(e) => setResize(parseFloat(e.target.value))} style={{ width: "100%" }} />
                              </div>
                            </div>
                            <button className="btn-primary" style={{ width: "100%", padding: "0.75rem" }} onClick={openComparison}>
                              🔍 Compare Quality (Live Preview)
                            </button>
                          </div>
                          <div className="convert-btns" style={{ display: "flex", gap: "1rem" }}>
                            <button className="btn-secondary" style={{ flex: 1, padding: "2rem" }} onClick={() => void convertTo("PDF")}>📄 PDF</button>
                            <button className="btn-secondary" style={{ flex: 1, padding: "2rem" }} onClick={() => void convertTo("DOCX")}>📝 Word</button>
                            <button className="btn-secondary" style={{ flex: 1, padding: "2rem" }} onClick={() => void convertTo("TXT")}>🔤 Text</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </main>
              </div>
            </>
          )}
        </div>
      </div>

      {commandOpen && (
        <div className="modal-overlay" onClick={() => setCommandOpen(false)} style={{ backdropFilter: "blur(20px)", background: "rgba(0,0,0,0.6)" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", padding: "1rem", borderRadius: "16px", background: "var(--panel)", boxShadow: "0 0 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>⚡</span>
              <input 
                autoFocus
                className="editor" 
                style={{ minHeight: "auto", border: "none", fontSize: "1.2rem", background: "transparent" }} 
                placeholder="Type a command (e.g. 'Convert all to PDF')..." 
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runCommand()}
              />
            </div>
            <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border)", marginTop: "0.5rem" }}>
              <p className="muted small" style={{ margin: 0 }}>
                Suggestions: <strong>Convert all to PDF</strong>, <strong>Summarize all</strong>, <strong>Search [filename]</strong>, <strong>Dark Mode</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {showCompare && (
        <div className="modal-overlay" onClick={() => setShowCompare(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, backdropFilter: "blur(12px)" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", padding: "2rem", borderRadius: "24px", maxWidth: "1000px", width: "95%", position: "relative", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 className="serif-title" style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>Quality Comparison</h2>
                <p className="muted">Slide to see the difference between Original and Optimized versions.</p>
              </div>
              <button onClick={() => setShowCompare(false)} style={{ background: "var(--border)", border: "none", width: "40px", height: "40px", borderRadius: "50%", fontSize: "1.5rem", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            <div style={{ position: "relative", height: "600px", borderRadius: "16px", overflow: "hidden", background: "#000" }}>
              {compareLoading ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "#fff" }}>
                  <div className="spinner"></div>
                  <p>Processing High-Fidelity Previews...</p>
                </div>
              ) : !previewOriginalUrl || !previewOptimizedUrl ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "#fff", padding: "2rem", textAlign: "center" }}>
                   <span style={{ fontSize: "3rem" }}>📭</span>
                   <h3>Preview Not Available</h3>
                   <p className="muted">We couldn't generate a visual preview for this document type or content. You can still proceed with the conversion.</p>
                </div>
              ) : (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  {/* Optimized (Background) */}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {previewOptimizedUrl && <img src={previewOptimizedUrl} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
                    <div style={{ position: "absolute", bottom: "1rem", right: "1rem", background: "rgba(0,0,0,0.6)", padding: "0.5rem 1rem", borderRadius: "20px", color: "#fff", fontSize: "0.8rem", backdropFilter: "blur(4px)" }}>
                      OPTIMIZED ({Math.round(compression*100)}% Comp, {Math.round(resize*100)}% Scale)
                    </div>
                  </div>

                  {/* Original (Foreground with Clip) */}
                  <div id="compare-clip" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", clipPath: "inset(0 50% 0 0)", borderRight: "2px solid #fff" }}>
                    {previewOriginalUrl && <img src={previewOriginalUrl} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
                    <div style={{ position: "absolute", bottom: "1rem", left: "1rem", background: "rgba(0,0,0,0.6)", padding: "0.5rem 1rem", borderRadius: "20px", color: "#fff", fontSize: "0.8rem", backdropFilter: "blur(4px)" }}>
                      ORIGINAL (100% Quality)
                    </div>
                  </div>

                  {/* Slider Control */}
                  <input 
                    type="range" 
                    min="0" max="100" defaultValue="50" 
                    style={{ position: "absolute", top: "50%", left: 0, width: "100%", transform: "translateY(-50%)", opacity: 0, cursor: "ew-resize", zIndex: 10 }}
                    onInput={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      const clip = document.getElementById("compare-clip");
                      const line = document.getElementById("compare-line");
                      if (clip) clip.style.clipPath = `inset(0 ${100 - parseInt(val)}% 0 0)`;
                      if (line) line.style.left = `${val}%`;
                    }}
                  />
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "2px", background: "#fff", pointerEvents: "none", boxShadow: "0 0 10px rgba(0,0,0,0.5)" }} id="compare-line">
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "40px", height: "40px", background: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(0,0,0,0.3)" }}>
                      ↔️
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "2rem" }}>
                <div>
                  <p className="muted small uppercase" style={{ letterSpacing: "0.1em", marginBottom: "0.25rem" }}>Savings</p>
                  <h3 style={{ color: "var(--grad-start)" }}>{selected ? Math.round((1 - (compression * resize * resize)) * 100) : 0}% Smaller</h3>
                </div>
                <div>
                  <p className="muted small uppercase" style={{ letterSpacing: "0.1em", marginBottom: "0.25rem" }}>Clarity</p>
                  <h3 style={{ color: compression > 0.7 ? "#10b981" : "#f59e0b" }}>{compression > 0.7 ? "High Fidelity" : "Optimized"}</h3>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button className="btn-secondary" onClick={() => setShowCompare(false)}>Close Preview</button>
                <button className="btn-primary" onClick={() => { setShowCompare(false); void convertTo("PDF"); }}>Accept & Convert</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg)", padding: "3rem", borderRadius: "24px", maxWidth: "600px", width: "90%", position: "relative", border: "1px solid var(--border)" }}>
            <button onClick={() => setShowAbout(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "2rem", color: "var(--text)", cursor: "pointer" }}>×</button>
            <h2 className="serif-title" style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>DocuFlex AI</h2>
            <p className="muted" style={{ fontSize: "1.2rem", marginBottom: "2rem" }}>Smart Document Management Platform</p>
            <div style={{ lineHeight: "1.7", color: "var(--text)" }}>
              <p>DocuFlex AI is built with modern web technologies to provide a high-fidelity experience for document processing, AI summarization, and multimodal interactions.</p>
              <h4 style={{ margin: "2rem 0 1rem" }}>Core Features:</h4>
              <ul style={{ paddingLeft: "1.5rem" }}>
                <li>✨ AI-Powered Summarization & Chat</li>
                <li>🖼️ Multimodal Vision OCR</li>
                <li>🔄 Smart PDF/DOCX/TXT Conversion</li>
                <li>👑 Full Role-Based Access (RBAC)</li>
              </ul>
              <p style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                Developed by <strong>Harshil Thakur</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
