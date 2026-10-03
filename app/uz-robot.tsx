/** O'zbekcha robot: do'ppi kiygan do'stona yordamchi (AI belgisi). */
export default function UzRobot({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {/* Do'ppi */}
      <path d="M9.5 21C9.5 10 16 5 24 5s14.5 5 14.5 16Z" fill="#14204f" />
      <path d="M24 7.2l1.9 1.9L24 11l-1.9-1.9ZM15.2 12.4l1.5 1.5-1.5 1.5-1.5-1.5ZM32.8 12.4l1.5 1.5-1.5 1.5-1.5-1.5ZM24 13.2l1.6 1.6-1.6 1.6-1.6-1.6Z" fill="#ffffff" />
      <circle cx="19.5" cy="17.2" r="1" fill="#e2b65c" />
      <circle cx="28.5" cy="17.2" r="1" fill="#e2b65c" />
      <rect x="8.5" y="18.5" width="31" height="4.5" rx="2.2" fill="#0b1236" />
      <path d="M12 20.7h24" stroke="#e2b65c" strokeWidth="1" strokeDasharray="2 2" />
      {/* Bosh */}
      <rect x="9" y="22" width="30" height="20" rx="9" fill="#17a2a0" />
      <rect x="13" y="26" width="22" height="12" rx="6" fill="#eafbfa" />
      <circle cx="19.5" cy="31.4" r="2.4" fill="#14204f" />
      <circle cx="28.5" cy="31.4" r="2.4" fill="#14204f" />
      <circle cx="20.3" cy="30.6" r=".7" fill="#fff" />
      <circle cx="29.3" cy="30.6" r=".7" fill="#fff" />
      <path d="M20.2 35.2q3.8 2.6 7.6 0" fill="none" stroke="#14204f" strokeWidth="1.8" strokeLinecap="round" />
      {/* Quloqlar */}
      <circle cx="7.6" cy="32" r="2.6" fill="#e2b65c" />
      <circle cx="40.4" cy="32" r="2.6" fill="#e2b65c" />
    </svg>
  );
}
