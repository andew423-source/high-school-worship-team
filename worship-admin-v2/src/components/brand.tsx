import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="고등부 찬양팀 홈">
      <span className="brand-mark" aria-hidden>W</span>
      <span>고등부 찬양팀</span>
    </Link>
  );
}
