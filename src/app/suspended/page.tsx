export const metadata = { title: "Account suspended" };

export default function Suspended() {
  return (
    <main className="mx-auto max-w-md space-y-3 p-6 pt-24">
      <h1 className="text-2xl font-semibold">Your account is suspended</h1>
      <p className="text-muted">If you think this is a mistake, please contact support.</p>
    </main>
  );
}
