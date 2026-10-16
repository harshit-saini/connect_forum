export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">{children}</main>;
}
