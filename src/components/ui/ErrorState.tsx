import { Button } from './Button';
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="error-state"><p>{message}</p>{onRetry && <Button onClick={onRetry}>Try again</Button>}</div>; }
