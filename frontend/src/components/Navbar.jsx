import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FileText, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Convert", to: "/convert" },
  { label: "Features", to: "/#features" },
  { label: "How it Works", to: "/#how-it-works" },
  { label: "About", to: "/#about" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  function handleNavClick(e, to) {
    if (to.startsWith("/#")) {
      const id = to.slice(2);
      setOpen(false);
      if (location.pathname !== "/") {
        navigate("/");
        // wait for landing page to mount, then scroll
        setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        }, 50);
        e.preventDefault();
        return;
      }
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      setOpen(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-soft">
            <FileText size={18} />
          </span>
          Chat2PDF
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              onClick={(e) => handleNavClick(e, link.to)}
              className="text-sm font-medium text-gray-600 transition hover:text-brand-600"
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/convert"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"
          >
            Generate PDF
          </Link>
        </div>

        <button
          className="md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-gray-100 bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                onClick={(e) => handleNavClick(e, link.to)}
                className="text-sm font-medium text-gray-700"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/convert"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white"
            >
              Generate PDF
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
