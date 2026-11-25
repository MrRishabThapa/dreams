import { Page } from '../ui/Page';
import { Button } from '../ui/Button';
import { EmptyState, Art } from '../ui/bits';
import { useApp } from '../lib/app';

export function AuditScreen() {
  const { openSheet } = useApp();
  return (
    <Page title="Audit">
      <EmptyState
        art={Art.chart}
        title="Your monthly audit"
        message="Where the money went, what you saved, and how your net worth moved. Coming in a later update."
        action={<Button size="md" onClick={() => openSheet({ kind: 'add' })}>Add Transaction</Button>}
      />
    </Page>
  );
}
