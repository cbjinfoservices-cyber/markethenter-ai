import { Link, useLocation } from 'react-router-dom';
import type { BurgerLink } from './PageBurger';

export default function SiteNavigationLinks({ items }: { items: BurgerLink[] }) {
  const { pathname } = useLocation();
  return items.map((item) => pathname === '/' && item.to.startsWith('/#') ? (
    <a
      key={item.key}
      href={item.to.slice(1)}
      className={item.current ? 'is-current' : undefined}
      aria-current={item.current ? 'true' : undefined}
    >
      {item.label}
    </a>
  ) : (
    <Link
      key={item.key}
      to={item.to}
      className={item.current ? 'is-current' : undefined}
      aria-current={item.current ? 'page' : undefined}
      onClick={item.onSelect}
    >
      {item.label}
    </Link>
  ));
}
