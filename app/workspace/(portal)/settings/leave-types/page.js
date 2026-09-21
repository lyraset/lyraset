import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import LeaveType from '@/models/workspace/LeaveType';
import { PageHead, Panel } from '@/components/workspace/ui';
import SettingsCrud from '@/components/workspace/SettingsCrud';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leave types' };

export default async function LeaveTypesPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const types = await LeaveType.find({}).sort({ name: 1 }).lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Leave types"
        lead="Each type carries its own rules. Paid and counts-toward-quota are separate, so a paid type that does not consume the monthly quota is possible."
      />

      <div className="alert alert-info ws-alert" role="note">
        Leave entitlements, working-hour limits and overtime rates differ between Pakistan and the
        UAE. Use the office list on a type to offer different entitlements per office, and confirm
        the policies with your HR or legal advisor for each country.
      </div>

      <Panel>
        <SettingsCrud
          endpoint="/api/workspace/settings/leave-types"
          collectionKey="Leave types"
          addLabel="Add leave type"
          emptyTitle="No leave types yet"
          emptyBody="Add one so employees have something to apply for."
          items={types.map((t) => ({
            id: String(t._id),
            name: t.name,
            code: t.code,
            color: t.color,
            paid: t.paid,
            countsTowardQuota: t.countsTowardQuota,
            monthlyLimit: t.monthlyLimit ?? '',
            allowHalfDay: t.allowHalfDay,
            requiresDocument: t.requiresDocument,
            documentAfterDays: t.documentAfterDays ?? 0,
            minNoticeDays: t.minNoticeDays ?? 0,
            offices: t.offices ?? [],
            active: t.active,
          }))}
          columns={[
            {
              key: 'name',
              label: 'Type',
              render: (item) => (
                <>
                  <span
                    className="ws-cal-dot me-2"
                    style={{ background: item.color }}
                    aria-hidden="true"
                  />
                  {item.name} ({item.code})
                </>
              ),
            },
            { key: 'paid', label: 'Paid', render: (item) => (item.paid ? 'Paid' : 'Unpaid') },
            {
              key: 'countsTowardQuota',
              label: 'Quota',
              render: (item) => (item.countsTowardQuota ? 'Counts' : 'Does not count'),
            },
            {
              key: 'monthlyLimit',
              label: 'Per-cycle limit',
              render: (item) => (item.monthlyLimit === '' ? 'None' : String(item.monthlyLimit)),
            },
            {
              key: 'requiresDocument',
              label: 'Document',
              render: (item) =>
                item.requiresDocument
                  ? item.documentAfterDays > 0
                    ? 'After ' + item.documentAfterDays + ' days'
                    : 'Always'
                  : 'Not needed',
            },
            {
              key: 'offices',
              label: 'Offices',
              render: (item) => (item.offices?.length ? item.offices.join(', ') : 'All'),
            },
            {
              key: 'active',
              label: 'Status',
              render: (item) => (item.active ? 'Active' : 'Retired'),
            },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true, col: 'col-12 col-md-4' },
            {
              name: 'code',
              label: 'Code',
              required: true,
              placeholder: 'CL',
              col: 'col-6 col-md-2',
            },
            {
              name: 'color',
              label: 'Colour',
              type: 'color',
              default: '#3d7bff',
              col: 'col-6 col-md-2',
            },
            {
              name: 'paid',
              label: 'Paid leave',
              type: 'checkbox',
              default: true,
              col: 'col-6 col-md-2',
            },
            {
              name: 'countsTowardQuota',
              label: 'Counts toward the monthly quota',
              type: 'checkbox',
              default: true,
              col: 'col-6 col-md-2',
            },
            {
              name: 'monthlyLimit',
              label: 'Per-cycle limit',
              type: 'number',
              nullable: true,
              min: '0',
              max: '31',
              step: '0.5',
              hint: 'Leave blank for no limit of its own.',
              col: 'col-6 col-md-3',
            },
            {
              name: 'allowHalfDay',
              label: 'Half days allowed',
              type: 'checkbox',
              default: true,
              col: 'col-6 col-md-3',
            },
            {
              name: 'requiresDocument',
              label: 'Requires a document',
              type: 'checkbox',
              col: 'col-6 col-md-3',
            },
            {
              name: 'documentAfterDays',
              label: 'Only past this many days',
              type: 'number',
              min: '0',
              max: '60',
              default: 0,
              hint: '0 means always.',
              col: 'col-6 col-md-3',
            },
            {
              name: 'minNoticeDays',
              label: 'Minimum notice (days)',
              type: 'number',
              min: '0',
              max: '90',
              default: 0,
              col: 'col-6 col-md-3',
            },
            {
              name: 'offices',
              label: 'Offered at',
              type: 'multiselect',
              options: [
                { value: 'ISLAMABAD', label: 'Islamabad' },
                { value: 'DUBAI', label: 'Dubai' },
              ],
              hint: 'None selected means every office.',
              col: 'col-12 col-md-3',
            },
            {
              name: 'active',
              label: 'Active',
              type: 'checkbox',
              default: true,
              col: 'col-6 col-md-3',
            },
          ]}
        />
      </Panel>
    </div>
  );
}
