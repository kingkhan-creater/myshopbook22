import Image from 'next/image';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="ShopBookPro Home">
      <Image src="/logo.png" alt="ShopBookPro Logo" width={32} height={32} />
      <span className="text-xl font-bold tracking-tight text-foreground">ShopBookPro</span>
    </Link>
  );
}
