import { useCallback, useEffect, useRef, useState } from "react";

const AUTOSAVE_KEY = "cn-autosave";
const AUTOSAVE_INTERVAL_MS = 5000;

interface UseFileOpsOptions {
  getCurrentSource: () => string;
}

interface UseFileOpsReturn {
  fileName: string | null;
  isDirty: boolean;
  openFile: () => Promise<string | null>;
  saveFile: (source: string) => Promise<void>;
  exportHtml: (html: string) => Promise<void>;
  newFile: () => void;
  markDirty: () => void;
  loadAutosave: () => string | null;
}

// Type augmentation for the File System Access API
interface FilePickerOptions {
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
}

/**
 * Hook for file operations: open, save, export, autosave.
 *
 * Uses the File System Access API where available, with fallback to
 * traditional file input / download for unsupported browsers.
 */
export function useFileOps({ getCurrentSource }: UseFileOpsOptions): UseFileOpsReturn {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const getSourceRef = useRef(getCurrentSource);

  // Keep ref in sync
  useEffect(() => {
    getSourceRef.current = getCurrentSource;
  }, [getCurrentSource]);

  // Autosave interval
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const src = getSourceRef.current();
        if (src) {
          localStorage.setItem(AUTOSAVE_KEY, src);
        }
      } catch {
        // localStorage may be unavailable
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  const loadAutosave = useCallback((): string | null => {
    try {
      return localStorage.getItem(AUTOSAVE_KEY);
    } catch {
      return null;
    }
  }, []);

  const openFile = useCallback(async (): Promise<string | null> => {
    // Try File System Access API first
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "ClearNotation files",
              accept: { "text/plain": [".cln"] },
            },
          ],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        fileHandleRef.current = handle;
        setFileName(file.name);
        setIsDirty(false);
        return text;
      } catch (err: any) {
        // User cancelled the picker
        if (err?.name === "AbortError") return null;
        throw err;
      }
    }

    // Fallback: <input type="file">
    return new Promise<string | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".cln,text/plain";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const text = await file.text();
        fileHandleRef.current = null;
        setFileName(file.name);
        setIsDirty(false);
        resolve(text);
      };
      input.click();
    });
  }, []);

  const saveFile = useCallback(async (source: string): Promise<void> => {
    // If we have an existing handle, write directly
    if (fileHandleRef.current) {
      try {
        const writable = await (fileHandleRef.current as any).createWritable();
        await writable.write(source);
        await writable.close();
        setIsDirty(false);
        return;
      } catch {
        // Fall through to save-as
      }
    }

    // Try File System Access API save-as
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName || "untitled.cln",
          types: [
            {
              description: "ClearNotation files",
              accept: { "text/plain": [".cln"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(source);
        await writable.close();
        fileHandleRef.current = handle;
        setFileName(handle.name);
        setIsDirty(false);
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        throw err;
      }
    }

    // Fallback: download via blob URL
    downloadBlob(source, fileName || "untitled.cln", "text/plain");
    setIsDirty(false);
  }, [fileName]);

  const exportHtml = useCallback(async (html: string): Promise<void> => {
    const suggestedName = fileName
      ? fileName.replace(/\.cln$/, ".html")
      : "document.html";

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "HTML files",
              accept: { "text/html": [".html"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(html);
        await writable.close();
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        throw err;
      }
    }

    // Fallback: download via blob URL
    downloadBlob(html, suggestedName, "text/html");
  }, [fileName]);

  const newFile = useCallback(() => {
    fileHandleRef.current = null;
    setFileName(null);
    setIsDirty(false);
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  return {
    fileName,
    isDirty,
    openFile,
    saveFile,
    exportHtml,
    newFile,
    markDirty,
    loadAutosave,
  };
}

/**
 * Download a string as a file via a temporary blob URL.
 */
function downloadBlob(content: string, name: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
