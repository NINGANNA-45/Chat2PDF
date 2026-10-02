import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Download, Eye, RefreshCcw, FileText, Loader2 } from "lucide-react";
import ChatInputForm from "../components/ChatInputForm.jsx";
import PlatformBadge from "../components/PlatformBadge.jsx";
import ConversationPreview from "../components/ConversationPreview.jsx";
import PdfSettingsPanel from "../components/PdfSettingsPanel.jsx";
import { fetchChat, generatePdf } from "../lib/api.js";

const DEFAULT_SETTINGS = {
  pageSize: "A4",
  orientation: "portrait",
  theme: "light",
  fontSize: "medium",
  showPageNumbers: true,
  showTitle: true,
};

// Stages the converter moves through, in order.
const STAGE = {
  INPUT: "input",
  FETCHING: "fetching",
  FETCH_ERROR: "fetch_error",
  PREVIEW: "preview",
  GENERATING: "generating",
  READY: "ready",
  GENERATE_ERROR: "generate_error",
};

export default function ConverterPage() {
  const [searchParams] = useSearchParams();
  const initialUrl = searchParams.get("url") || "";

  const [stage, setStage] = useState(STAGE.INPUT);
  const [errorMessage, setErrorMessage] = useState("");
  const [platform, setPlatform] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);

  useEffect(() => {
    if (initialUrl) {
      handleFetch(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFetch(url) {
    setStage(STAGE.FETCHING);
    setErrorMessage("");
    setPdfUrl(null);

    const result = await fetchChat(url);

    if (!result.success) {
      setErrorMessage(result.error || "Something went wrong fetching that conversation.");
      setStage(STAGE.FETCH_ERROR);
      return;
    }

    setPlatform(result.platform);
    setConversation(result.conversation);
    setStage(STAGE.PREVIEW);
  }

  async function handleGenerate() {
    setStage(STAGE.GENERATING);
    setErrorMessage("");

    const result = await generatePdf(conversation, settings);

    if (!result.success) {
      setErrorMessage(result.error || "Something went wrong generating the PDF.");
      setStage(STAGE.GENERATE_ERROR);
      return;
    }

    setPdfUrl(result.blobUrl);
    setPdfBlob(result.blob);
    setStage(STAGE.READY);
  }

  function handleReset() {
    setStage(STAGE.INPUT);
    setConversation(null);
    setPlatform(null);
    setErrorMessage("");
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  }

  function handleDownload() {
    if (!pdfBlob) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    const safeTitle = (conversation?.metadata?.title || "conversation")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);
    link.download = `${platform || "chat"}-${safeTitle || "conversation"}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const isFetchingOrGenerating = stage === STAGE.FETCHING || stage === STAGE.GENERATING;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Chat2PDF</h1>
        <p className="mt-2 text-gray-600">Paste your shared conversation link</p>
      </div>

      <div className="mx-auto max-w-2xl">
        <ChatInputForm
          onSubmit={handleFetch}
          loading={isFetchingOrGenerating}
          initialValue={initialUrl}
        />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Supported platforms
          </span>
          <PlatformBadge platform="chatgpt" />
          <PlatformBadge platform="claude" />
          <PlatformBadge platform="whatsapp" />
          <PlatformBadge platform="more" />
        </div>
      </div>

      {stage === STAGE.FETCHING && (
        <div className="mt-12 flex flex-col items-center gap-3 text-gray-500">
          <Loader2 size={28} className="animate-spin text-brand-600" />
          <p className="text-sm">Fetching the conversation...</p>
        </div>
      )}

      {(stage === STAGE.FETCH_ERROR || stage === STAGE.GENERATE_ERROR) && (
        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {stage === STAGE.FETCH_ERROR ? "Couldn't fetch that conversation" : "Couldn't generate the PDF"}
              </p>
              <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
              <button
                onClick={handleReset}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline"
              >
                <RefreshCcw size={14} />
                Try a different link
              </button>
            </div>
          </div>
        </div>
      )}

      {(stage === STAGE.PREVIEW || stage === STAGE.GENERATING || stage === STAGE.READY) &&
        conversation && (
          <div className="mt-12 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                  Conversation preview
                </h2>
                <PlatformBadge platform={platform} />
              </div>
              <ConversationPreview conversation={conversation} />
            </div>

            <div className="space-y-6">
              <PdfSettingsPanel settings={settings} onChange={setSettings} />

              {stage !== STAGE.READY ? (
                <button
                  onClick={handleGenerate}
                  disabled={stage === STAGE.GENERATING}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {stage === STAGE.GENERATING ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <FileText size={16} />
                      Generate PDF
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-sm font-semibold text-emerald-700">
                    Your PDF is ready!
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                    >
                      <Eye size={15} />
                      Preview
                    </a>
                    <button
                      onClick={handleDownload}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      <Download size={15} />
                      Download
                    </button>
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    <RefreshCcw size={13} />
                    Convert another chat
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
