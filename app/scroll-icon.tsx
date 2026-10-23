import type { SVGProps } from "react";

/**
 * Bildirishnoma belgisi: qo'ng'iroq o'rniga tik turgan varaq sandig'i (Tavrot/megillah uslubi) —
 * ikki yumaloq qopqoq, silindr korpus va ikki o'ram chizig'i. Lucide bilan bir xil: `currentColor`,
 * 24×24, chiziqli.
 */
export default function ScrollIcon({
  size = 24,
  strokeWidth = 1.8,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="2" r="1" />
      <path d="M7.5 6.5C7.5 4.4 9.2 3.2 12 3.2s4.5 1.2 4.5 3.3z" />
      <rect x="9" y="6.5" width="6" height="11" rx="0.6" />
      <path d="M9 9.5h6M9 14.5h6" />
      <path d="M7.5 17.5c0 2.1 1.7 3.3 4.5 3.3s4.5-1.2 4.5-3.3z" />
      <circle cx="12" cy="22" r="1" />
    </svg>
  );
}
