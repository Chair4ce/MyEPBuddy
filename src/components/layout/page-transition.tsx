"use client";

import { usePathname } from "next/navigation";

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  
  return (
    <div key={pathname} className="animate-fade-in w-full flex flex-col items-center">
      {children}
    </div>
  );
}

