import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

/**
 * Sends a chat URL to the backend, which detects the platform and
 * returns a normalized conversation object.
 */
export async function fetchChat(url) {
  try {
    const { data } = await client.post("/api/fetch-chat", { url });
    return data;
  } catch (err) {
    return normalizeAxiosError(err);
  }
}

/**
 * Sends the normalized conversation + PDF settings to the backend and
 * returns a Blob URL the browser can preview/download, or an error.
 */
export async function generatePdf(conversation, settings) {
  try {
    const response = await client.post(
      "/api/generate-pdf",
      { conversation, settings },
      { responseType: "blob" }
    );

    const contentType = response.headers["content-type"] || "";
    if (!contentType.includes("application/pdf")) {
      // The server sent a JSON error but axios still resolved because
      // responseType is 'blob' - decode it to get the real message.
      const text = await response.data.text();
      const parsed = JSON.parse(text);
      return { success: false, error: parsed.error || "Failed to generate PDF." };
    }

    const blob = new Blob([response.data], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    return { success: true, blobUrl, blob };
  } catch (err) {
    return normalizeAxiosError(err);
  }
}

async function normalizeAxiosError(err) {
  if (err.response?.data) {
    // If the server returned a blob containing a JSON error body.
    if (err.response.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        return { success: false, error: parsed.error || "Something went wrong." };
      } catch (_) {
        // fall through
      }
    }
    if (typeof err.response.data === "object" && err.response.data.error) {
      return { success: false, error: err.response.data.error };
    }
  }

  if (err.code === "ECONNABORTED") {
    return { success: false, error: "The request timed out. Please try again." };
  }

  return {
    success: false,
    error: "Could not reach the server. Please check your connection and try again.",
  };
}
