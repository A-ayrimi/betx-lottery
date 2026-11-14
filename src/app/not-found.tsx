import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md rounded-2xl p-8 text-center">
        <p className="font-display text-6xl font-bold text-foil">404</p>
        <h1 className="mt-3 text-xl font-black text-white">Page not found · صفحه پیدا نشد</h1>
        <Link href="/" className="btn-neon focus-ring mt-6 inline-block rounded-xl px-6 py-3 font-bold">
          BETX →
        </Link>
      </div>
    </main>
  );
}
