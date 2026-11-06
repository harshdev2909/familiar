import Image from "next/image";
import { LogoMark } from "../brand/LogoMark";

const STACK = [
  { name: "0G", what: "AI & memory", href: "https://0g.ai", logo: "/logos/0g.svg", color: "#B75FFF", scale: "size-9" },
  { name: "Uniswap", what: "feeding", href: "https://uniswap.org", logo: "/logos/uniswap.png", color: null, scale: "size-7" },
  { name: "ENS", what: "its name", href: "https://ens.domains", logo: "/logos/ens.svg", color: "#0080BC", scale: "size-6" },
  { name: "Base", what: "payments", href: "https://base.org", logo: "/logos/base.svg", color: "#0000FF", scale: "size-5" },
  { name: "Ethereum", what: "home", href: "https://ethereum.org", logo: "/logos/ethereum.svg", color: "#627EEA", scale: "size-6" },
] as const;

/** "Built on" — monochrome marks at rest, their own colour on hover/focus. */
export function BuiltOn() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-10" aria-labelledby="built-on">
      <h2 id="built-on" className="text-center text-sm font-medium text-muted-foreground">Built on</h2>
      <ul className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {STACK.map((s) => (
          <li key={s.name}>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-12 items-center gap-2.5 rounded-full px-4 text-muted-foreground transition-colors hover:bg-card hover:text-foreground hover:shadow-sticker focus-visible:text-foreground"
            >
              <span className="grid size-9 place-items-center">
                {s.color ? (
                  <span className="relative grid place-items-center">
                    <LogoMark src={s.logo} className={`${s.scale} transition-opacity duration-300 group-hover:opacity-0 group-focus-visible:opacity-0`} />
                    <LogoMark src={s.logo} color={s.color} className={`${s.scale} absolute opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100`} />
                  </span>
                ) : (
                  <Image src={s.logo} alt="" width={28} height={28} className={`${s.scale} rounded-lg opacity-70 grayscale transition-[filter,opacity] duration-300 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:grayscale-0`} />
                )}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-[11px] text-muted-foreground">{s.what}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
