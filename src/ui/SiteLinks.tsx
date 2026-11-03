const LINKS = [
  { href: '/home.html', label: 'Home' },
  { href: '/about.html', label: 'About' },
  { href: '/contact.html', label: 'Contact' },
  { href: '/privacy.html', label: 'Privacy' },
];

/** Links to the site's information pages. They open in a new tab so the game keeps running. */
export function SiteLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Site" className={className}>
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener" className="px-2.5 py-1 text-xs text-white/70 active:text-white sm:hover:text-white">
          {l.label}
        </a>
      ))}
    </nav>
  );
}
