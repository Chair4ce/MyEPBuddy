export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      {/* Unclassified Banner */}
      <div className="w-full flex justify-center py-3 border-b bg-background/80 backdrop-blur">
        <span className="px-3 py-1 text-xs font-semibold tracking-wider rounded bg-green-600 text-white dark:bg-green-700 dark:text-green-50 select-none">
          UNCLASSIFIED
        </span>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 w-full max-w-md px-4">{children}</div>
      </div>
    </div>
  );
}

