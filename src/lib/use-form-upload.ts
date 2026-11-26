"use client";

import { useRef, useState } from "react";

function createRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function useFormUpload() {
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  function resetRequest() {
    if (!inFlight.current) requestId.current = null;
  }

  async function send<T>(url: string, form: FormData, idempotent = true) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setProgress(null);
    try {
      const response = await new Promise<{ status: number; data: (T & { error?: string }) | null }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", url);
        request.timeout = 5 * 60 * 1000;
        request.responseType = "json";
        if (idempotent) {
          requestId.current ??= createRequestId();
          request.setRequestHeader("Idempotency-Key", requestId.current);
        }
        request.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) setProgress(Math.floor(100 * event.loaded / event.total));
        };
        request.upload.onload = () => setProgress(100);
        request.onload = () => resolve({ status: request.status, data: request.response });
        request.onerror = () => reject(new Error("Tarmoq bilan aloqa uzildi. Qayta urinib ko'ring."));
        request.ontimeout = () => reject(new Error("Server javobi kechikdi. Qayta urinib ko'ring."));
        request.onabort = () => reject(new Error("Yuborish bekor qilindi."));
        request.send(form);
      });
      if (response.status < 500 && response.status !== 0) requestId.current = null;
      return { ...response, ok: response.status >= 200 && response.status < 300 };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { busy, progress, resetRequest, send };
}
