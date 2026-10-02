import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FileDown,
  ShieldCheck,
  Sparkles,
  Palette,
  Link2,
  ScanSearch,
  FileText as FileIcon,
  Lock,
} from "lucide-react";
import ChatInputForm from "../components/ChatInputForm.jsx";
import PlatformBadge from "../components/PlatformBadge.jsx";

export default function LandingPage() {
  const navigate = useNavigate();

  function handleSubmit(url) {
    navigate(`/convert?url=${encodeURIComponent(url)}`);
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white px-6 pb-20 pt-20 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-1.5 text-xs font-semibold text-brand-700 shadow-sm">
            <Sparkles size={13} />
            Now supporting ChatGPT.
          </span>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            Turn any chat into a{" "}
            <span className="gradient-text">beautiful PDF</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg text-gray-600">
            Paste a shared ChatGPT, Claude, WhatsApp, or supported chat link and turn the
            entire conversation into a clean, professional PDF.
          </p>

          <div className="mx-auto mt-10 max-w-2xl">
            <ChatInputForm onSubmit={handleSubmit} size="large" />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Supported:
            </span>
            <PlatformBadge platform="chatgpt" />
            <PlatformBadge platform="claude" />
            <PlatformBadge platform="whatsapp" />
            <PlatformBadge platform="more" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">Built for clean, shareable output</h2>
          <p className="mt-3 text-gray-600">
            Every PDF is generated from a normalized conversation, so formatting stays
            consistent no matter which platform it came from.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={FileDown}
            title="Professional PDFs"
            description="Clean typography, role-labeled messages, page numbers, and a title header — ready to share or archive."
          />
          <FeatureCard
            icon={Palette}
            title="Customizable output"
            description="Choose page size, orientation, light or dark theme, and font size before you export."
          />
          <FeatureCard
            icon={ScanSearch}
            title="Markdown &amp; code aware"
            description="Headings, lists, tables, and fenced code blocks are preserved and beautifully formatted."
          />
          <FeatureCard
            icon={Link2}
            title="Just paste a link"
            description="No copy-pasting transcripts. Drop in a shared conversation URL and we handle the rest."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Privacy-respecting"
            description="We only ever fetch content that's already publicly accessible. We never ask for your passwords."
          />
          <FeatureCard
            icon={Sparkles}
            title="Modular platform support"
            description="Built to grow — Gemini, Perplexity, Telegram, and more are on the roadmap."
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-gray-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">How it works</h2>
            <p className="mt-3 text-gray-600">From link to PDF in four simple steps.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard number="1" title="Paste your link" description="Drop in a public shared conversation URL." />
            <StepCard number="2" title="We detect &amp; fetch" description="Chat2PDF identifies the platform and pulls the conversation." />
            <StepCard number="3" title="We format it" description="Messages, code, tables and lists are laid out cleanly." />
            <StepCard number="4" title="Preview &amp; download" description="Review the PDF and download it instantly." />
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-4xl px-6 py-20">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="mb-4 flex items-center gap-2 text-brand-600">
            <Lock size={18} />
            <h2 className="text-xl font-extrabold text-gray-900">About Chat2PDF</h2>
          </div>
          <p className="text-gray-600">
            Chat2PDF only processes conversations that are already publicly accessible —
            we never ask for a ChatGPT, Claude, or WhatsApp password, and we never attempt
            to bypass login, authentication, or CAPTCHA protections. If a link requires
            private account access, we'll tell you clearly instead of pretending it
            worked.
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <FileIcon size={14} />
            Built with React, Vite, Tailwind CSS, Node.js and Express.
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon size={20} />
      </div>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
        {number}
      </div>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-xs text-gray-600">{description}</p>
    </div>
  );
}
