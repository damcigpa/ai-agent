"use client";

import { useRouter } from "next/navigation";
import { ReactNode, MouseEvent } from "react";

export function Modal({ children }: { children: ReactNode }) {
  const router = useRouter();

  const close = () => router.back();

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white rounded-2xl shadow-xl relative">
        <button
          onClick={close}
          className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-xl"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
