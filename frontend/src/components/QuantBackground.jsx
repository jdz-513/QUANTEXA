import React from 'react';

/**
 * QuantBackground: Subtle 3D Quantitative Background
 * Matching the reference image:
 * - Clean light #F7F9FC canvas
 * - Soft mountain/quantitative geometric terrain silhouette at bottom
 * - Subtle ambient cyan/blue gradients
 * - Faint geometric wireframes and coordinate dots
 * - Strictly low opacity (0.04 - 0.06), non-distracting, zero chart interference
 */
export default function QuantBackground() {
  return (
    <div className="quant-bg-layer" aria-hidden="true">
      <svg
        className="quant-bg-svg"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Micro precision coordinate dot pattern */}
          <pattern id="quantMicroDots" width="36" height="36" patternUnits="userSpaceOnUse">
            <circle cx="18" cy="18" r="0.7" fill="#0F172A" fillOpacity="0.22" />
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#2563EB" strokeWidth="0.5" strokeOpacity="0.05" />
          </pattern>

          {/* Soft top-down radial light */}
          <radialGradient id="quantGlowTop" cx="50%" cy="0%" r="70%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.07" />
            <stop offset="50%" stopColor="#2563EB" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#F7F9FC" stopOpacity="0.0" />
          </radialGradient>

          {/* Subtle bottom alpine/quantitative terrain silhouette gradient */}
          <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.12" />
            <stop offset="60%" stopColor="#60A5FA" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.16" />
          </linearGradient>

          <linearGradient id="terrainBackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.04" />
          </linearGradient>

          {/* Soft blur for background shapes */}
          <filter id="softBgBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Base light canvas */}
        <rect width="100%" height="100%" fill="#F7F9FC" />
        <rect width="100%" height="100%" fill="url(#quantGlowTop)" />

        {/* Coordinate micro grid */}
        <rect width="100%" height="100%" fill="url(#quantMicroDots)" />

        {/* Distant background mountain ridge */}
        <path
          d="M0,880 L180,820 L380,850 L600,790 L850,840 L1150,770 L1420,830 L1680,780 L1920,840 L1920,1080 L0,1080 Z"
          fill="url(#terrainBackGrad)"
        />

        {/* Foreground sharp geometric mountain peaks matching reference footer */}
        <path
          d="M0,940 L220,860 L440,920 L720,850 L980,910 L1260,840 L1520,900 L1780,830 L1920,880 L1920,1080 L0,1080 Z"
          fill="url(#terrainGrad)"
          stroke="#93C5FD"
          strokeWidth="0.8"
          strokeOpacity="0.25"
        />

        {/* Faint geometric floating blocks with soft blur */}
        <g filter="url(#softBgBlur)" opacity="0.6">
          <g transform="translate(1380, 140) scale(0.6)">
            <polygon points="40,0 80,20 40,40 0,20" fill="#DBEAFE" fillOpacity="0.3" stroke="#38BDF8" strokeWidth="0.8" />
            <polygon points="0,20 40,40 40,80 0,60" fill="#2563EB" fillOpacity="0.09" stroke="#2563EB" strokeWidth="0.8" />
            <polygon points="40,40 80,20 80,60 40,80" fill="#0891B2" fillOpacity="0.14" stroke="#0891B2" strokeWidth="0.8" />
          </g>
        </g>
      </svg>
    </div>
  );
}
