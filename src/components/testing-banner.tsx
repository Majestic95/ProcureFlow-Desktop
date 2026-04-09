/**
 * Testing environment banner. Only renders when the app is NOT connected
 * to the production Firebase project. Completely invisible in production
 * regardless of which branch is deployed.
 */
export function TestingBanner() {
  // In Tauri desktop mode, there's no Firebase project — always treat as production
  const isTauri = '__TAURI__' in window || !import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (isTauri) return null;

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const isProduction = projectId === 'production-project';
  if (isProduction) return null;

  return (
    <>
      {/* Fixed banner always visible at top */}
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-1 font-bold text-sm tracking-widest uppercase select-none">
        TESTING ENVIRONMENT
      </div>
      {/* Spacer to push content below the fixed banner */}
      <div className="h-7" />
    </>
  );
}
