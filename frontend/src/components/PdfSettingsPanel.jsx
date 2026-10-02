import React from "react";
import { Settings2 } from "lucide-react";

const PAGE_SIZES = ["A4", "LETTER", "LEGAL"];
const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const FONT_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export default function PdfSettingsPanel({ settings, onChange }) {
  function update(key, value) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Settings2 size={16} className="text-brand-600" />
        <h3 className="text-sm font-bold text-gray-900">PDF Settings</h3>
      </div>

      <div className="space-y-4">
        <Field label="Page size">
          <select
            value={settings.pageSize}
            onChange={(e) => update("pageSize", e.target.value)}
            className="select-input"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Orientation">
          <div className="flex gap-2">
            {["portrait", "landscape"].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => update("orientation", o)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition ${
                  settings.orientation === o
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Theme">
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => update("theme", t.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  settings.theme === t.value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Font size">
          <select
            value={settings.fontSize}
            onChange={(e) => update("fontSize", e.target.value)}
            className="select-input"
          >
            {FONT_SIZES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center justify-between text-sm text-gray-700">
          Show title page header
          <input
            type="checkbox"
            checked={settings.showTitle}
            onChange={(e) => update("showTitle", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
        </label>

        <label className="flex items-center justify-between text-sm text-gray-700">
          Show page numbers
          <input
            type="checkbox"
            checked={settings.showPageNumbers}
            onChange={(e) => update("showPageNumbers", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
        </label>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-gray-500">{label}</p>
      {children}
    </div>
  );
}
