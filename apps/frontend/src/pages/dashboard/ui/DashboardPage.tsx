import { useQuery } from '@tanstack/react-query';

import { Can } from '@/shared/lib/casl/ability-context';
import { Button } from '@/shared/ui';

/**
 * Listing page for posts. Fetches via TanStack Query and gates the
 * "New post" button behind the CASL `<Can I="create" a="Post">` check, so
 * anonymous visitors never see it (and an admin/user does).
 */
export function DashboardPage(): React.ReactElement {

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Can I="create" a="Post">
          <div>You can do it!</div>
        </Can>
      </div>


    </main>
  );
}
