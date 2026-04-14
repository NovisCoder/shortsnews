import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Tv2, History, Plus, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useHashLocation();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }, [dark]);

  const navItems = [
    { href: "/", label: "새 대본", icon: Plus },
    { href: "/history", label: "히스토리", icon: History },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <a className="flex items-center gap-2 no-underline" data-testid="link-logo">
              {/* SVG logo */}
              <svg
                width="28" height="28" viewBox="0 0 28 28" fill="none"
                aria-label="쇼츠뉴스 로고"
                className="text-primary"
              >
                <rect x="2" y="6" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 10l6-4v16l-6-4V10z" fill="currentColor"/>
                <line x1="6" y1="11" x2="14" y2="11" stroke="hsl(var(--background))" strokeWidth="1.5"/>
                <line x1="6" y1="14" x2="12" y2="14" stroke="hsl(var(--background))" strokeWidth="1.5"/>
                <line x1="6" y1="17" x2="10" y2="17" stroke="hsl(var(--background))" strokeWidth="1.5"/>
              </svg>
              <span style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "1.1rem" }}>
                쇼츠뉴스
              </span>
            </a>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <a
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors no-underline
                    ${location === href
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  data-testid={`nav-${label}`}
                >
                  <Icon size={15} />
                  {label}
                </a>
              </Link>
            ))}

            <button
              onClick={() => setDark(!dark)}
              className="ml-2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="테마 전환"
              data-testid="button-theme-toggle"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        쇼츠뉴스 MVP · 사람 검수 후 export
      </footer>
    </div>
  );
}
