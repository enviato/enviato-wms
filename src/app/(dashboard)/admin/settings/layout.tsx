"use client";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[1140px] mx-auto px-6 py-5 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
