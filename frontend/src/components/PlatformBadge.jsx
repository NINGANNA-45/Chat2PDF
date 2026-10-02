import React from "react";
import { Bot, MessageCircle, Sparkles, Globe } from "lucide-react";

const PLATFORM_CONFIG = {
  chatgpt: { label: "ChatGPT", icon: Sparkles, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  claude: { label: "Claude", icon: Bot, className: "bg-orange-50 text-orange-700 border-orange-200" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, className: "bg-green-50 text-green-700 border-green-200" },
  more: { label: "More coming soon", icon: Globe, className: "bg-gray-50 text-gray-500 border-gray-200" },
};

export default function PlatformBadge({ platform }) {
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.more;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${config.className}`}
    >
      <Icon size={13} />
      {config.label}
    </span>
  );
}
