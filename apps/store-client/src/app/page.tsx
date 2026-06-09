export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Welcome to MobileStore
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Your one-stop shop for mobile phone accessories — cases, chargers,
          screen protectors, and more.
        </p>
      </section>

      <section className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-64 items-center justify-center rounded-lg border border-border bg-muted"
          >
            <p className="text-sm text-muted-foreground">
              Product card placeholder
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
