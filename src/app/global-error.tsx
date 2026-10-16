"use client";

// Only shown when the root layout itself fails, so it cannot rely on the app's styles or components.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 24 }}>
        <main style={{ maxWidth: 420 }}>
          <h1>Something went wrong</h1>
          <p>Please try again in a moment.</p>
          <button onClick={reset} style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#0f766e", color: "#fff", fontSize: 16 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
