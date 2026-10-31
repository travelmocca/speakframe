export function ProcessingIndicator({ children }: { children: React.ReactNode }) {
  return <span className="processing-indicator" role="status"><span className="processing-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><span>{children}</span></span>;
}
