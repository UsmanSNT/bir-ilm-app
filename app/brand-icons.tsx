import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number };

const base = (size: number, rest: Omit<IconProps, "size">) => ({ width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false, ...rest });

/** Tarmoq belgilari (lucide'da logotiplar yo'q): oddiy, bir rangli (currentColor). */
export function Telegram({ size = 20, ...rest }: IconProps) {
  return <svg {...base(size, rest)} fill="currentColor"><path fillRule="evenodd" d="M21.6 3.4 2.7 10.6c-.9.4-.9 1.2-.2 1.4l4.8 1.5 1.8 5.6c.2.6.9.8 1.4.4l2.6-2.2 4.9 3.6c.7.4 1.4.2 1.6-.7L23 4.7c.3-1.1-.4-1.7-1.4-1.3ZM9.4 13.2l8.6-5.4c.4-.2.7 0 .4.3l-7 6.3-.3 3-1.4-4.2Z" /></svg>;
}

export function YouTube({ size = 20, ...rest }: IconProps) {
  return <svg {...base(size, rest)} fill="currentColor"><path fillRule="evenodd" d="M4.5 4.5h15A3.5 3.5 0 0 1 23 8v8a3.5 3.5 0 0 1-3.5 3.5h-15A3.5 3.5 0 0 1 1 16V8a3.5 3.5 0 0 1 3.5-3.5ZM10 8.8v6.4l5.6-3.2Z" /></svg>;
}

export function Instagram({ size = 20, ...rest }: IconProps) {
  return <svg {...base(size, rest)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;
}

export function Facebook({ size = 20, ...rest }: IconProps) {
  return <svg {...base(size, rest)} fill="currentColor"><path d="M14 8.5V6.9c0-.8.2-1.3 1.4-1.3H17V2.2C16.7 2.1 15.7 2 14.6 2 12.2 2 10.5 3.5 10.5 6.2v2.3H8v3.6h2.5V22H14v-9.9h2.6l.4-3.6Z" /></svg>;
}
