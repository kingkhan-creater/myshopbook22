import { Briefcase } from 'lucide-react';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="ShopBookPro Home">
      <Briefcase className="h-7 w-7 text-primary" />
      <span className="text-xl font-bold tracking-tight text-foreground">ShopBookPro</span>
    </Link>
  );
}
