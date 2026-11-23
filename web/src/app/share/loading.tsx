// Fork: loading state for the share page (every page has one beside it).
export default function Loading() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="size-6 animate-spin rounded-full border-2 border-border border-t-brand-text" />
    </div>
  );
}
