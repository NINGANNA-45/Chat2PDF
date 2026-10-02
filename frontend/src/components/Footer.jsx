import React from "react";
import { FileText } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-gray-500 md:flex-row">
        <div className="flex items-center gap-2 font-semibold text-gray-700">
          <FileText size={16} className="text-brand-600" />
          Chat2PDF
        </div>
        <p>Turn any shared chat into a beautiful PDF.</p>
        <p>&copy; {new Date().getFullYear()} Chat2PDF.</p>
      </div>
    </footer>
  );
}
