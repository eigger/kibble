import type { SVGProps } from "react";

function iconProps(size = 18, strokeWidth = 1.8): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
}

export function PackageIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size)} className={className}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 12v10" />
    </svg>
  );
}

export function InfoIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size, 2)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function RotateCcwIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size)} className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size)} className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size, 2)} className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronUpIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size, 2)} className={className}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function CameraIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size)} className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export function CalendarIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size)} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function AlertCircleIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size, 2)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function LightbulbIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...iconProps(size)} className={className}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}
