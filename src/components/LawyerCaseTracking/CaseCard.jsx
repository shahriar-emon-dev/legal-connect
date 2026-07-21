import React from 'react';
import CaseStatusBadge from './CaseStatusBadge';
import ProgressCard from './ProgressCard';

const CaseCard = ({
  caseItem,
  onViewDetails,
  onOpenMessages,
  onOpenDocuments,
  onOpenTimeline,
  onOpenInvoice,
  onMarkComplete,
  onUpdateProgress,
  onSubmitDelivery,
  isCompleting = false,
}) => {
  if (!caseItem) return null;

  const idString = String(caseItem.id);
  const caseNumber = idString.startsWith('contract_')
    ? `#CNT-${idString.replace('contract_', '').slice(0, 6).toUpperCase()}`
    : idString.startsWith('consultation_')
    ? `#CON-${idString.replace('consultation_', '').slice(0, 6).toUpperCase()}`
    : `#CASE-${idString.slice(0, 6).toUpperCase()}`;

  const title = caseItem.title || caseItem.case_title || 'Legal Representation Matter';
  const practiceArea = caseItem.practice_area || caseItem.case_type || caseItem.category || 'General Legal Practice';
  const status = caseItem.status || 'active';
  const priority = caseItem.priority || (Number(caseItem.agreed_fee || 0) >= 50000 ? 'High' : 'Normal');

  // Client info
  const clientName = caseItem.client?.name || caseItem.client?.full_name || caseItem.client_name || 'Client';
  const clientAvatar = caseItem.client?.profile_picture_url || caseItem.client?.avatar_url || null;

  // Contract and Payment badges
  const contractStatus = caseItem.contract?.status || (caseItem.contract ? 'Signed' : 'Pending Issuance');
  const paymentStatus = caseItem.payment_status || (caseItem.contract?.status === 'active' ? 'Escrow Secured' : 'Pending Retainer');
  const agreedFee = Number(caseItem.contract?.amount || caseItem.contract?.agreed_amount || caseItem.agreed_fee || 0);

  // Dates
  const acceptedDate = caseItem.created_at || caseItem.updated_at
    ? new Date(caseItem.created_at || caseItem.updated_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Recently';

  const nextDeadline = caseItem.next_hearing_date || caseItem.deadline || caseItem.estimated_completion
    ? new Date(caseItem.next_hearing_date || caseItem.deadline || caseItem.estimated_completion).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'None Scheduled';

  // Unread count
  const unreadCount = Number(caseItem.unread_messages_count || 0);

  // Allowed actions based on status
  const normStatus = String(status || '').toLowerCase();
  const normContractStatus = String(caseItem.contract?.status || '').toLowerCase();
  const isActiveOrProgress =
    normStatus === 'active' ||
    normStatus === 'in progress' ||
    normStatus === 'in_progress' ||
    normStatus.includes('ongoing') ||
    normStatus === 'confirmed' ||
    normContractStatus === 'active' ||
    normContractStatus === 'signed' ||
    normContractStatus === 'in_progress' ||
    normContractStatus === 'revision_requested' ||
    normStatus === 'revision_requested';

  return (
    <div className="bg-white rounded-2xl border border-border-subtle p-6 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between space-y-5">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-navy-primary/5 text-navy-primary border border-navy-primary/10">
              {caseNumber}
            </span>
            <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-md bg-accent-gold/15 text-navy-primary border border-accent-gold/30">
              {practiceArea}
            </span>
            <span
              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                priority === 'High'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : priority === 'Medium'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200'
              }`}
            >
              Priority: {priority}
            </span>
          </div>
          <h3 className="font-serif font-bold text-lg text-navy-primary tracking-tight truncate pt-1">{title}</h3>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <CaseStatusBadge status={status} size="md" />
        </div>
      </div>

      {/* Middle Grid: Client & Financials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-bg-light/50 p-4 rounded-xl border border-border-subtle/80 text-xs">
        {/* Client Profile */}
        <div className="flex items-center gap-3 min-w-0">
          {clientAvatar ? (
            <img src={clientAvatar} alt={clientName} className="w-10 h-10 rounded-xl object-cover border border-border-subtle flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-navy-primary text-accent-gold font-bold text-base flex items-center justify-center border border-border-subtle flex-shrink-0">
              {clientName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-text-muted block leading-none">Assigned Client</span>
            <span className="font-bold text-navy-primary text-sm block mt-0.5 truncate">{clientName}</span>
          </div>
        </div>

        {/* Contract Status */}
        <div className="min-w-0 border-t sm:border-t-0 sm:border-l border-border-subtle/80 pt-2 sm:pt-0 sm:pl-4">
          <span className="text-[10px] uppercase font-bold text-text-muted block leading-none">Contract Status</span>
          <span className="font-bold text-navy-primary text-xs block mt-1 truncate flex items-center gap-1.5">
            <span>📜</span>
            <span>{contractStatus}</span>
          </span>
        </div>

        {/* Payment & Retainer */}
        <div className="min-w-0 border-t lg:border-t-0 lg:border-l border-border-subtle/80 pt-2 lg:pt-0 lg:pl-4">
          <span className="text-[10px] uppercase font-bold text-text-muted block leading-none">Agreed Fee / Retainer</span>
          <span className="font-black text-emerald-700 text-sm block mt-1 truncate">
            BDT {agreedFee.toLocaleString()}
          </span>
          <span className="text-[10px] text-gray-500 font-semibold block">{paymentStatus}</span>
        </div>

        {/* Next Deadline */}
        <div className="min-w-0 border-t sm:border-t-0 sm:border-l border-border-subtle/80 pt-2 sm:pt-0 sm:pl-4">
          <span className="text-[10px] uppercase font-bold text-text-muted block leading-none">Next Target / Hearing</span>
          <span className="font-bold text-navy-primary text-xs block mt-1 truncate flex items-center gap-1">
            <span>🗓️</span>
            <span>{nextDeadline}</span>
          </span>
          <span className="text-[10px] text-text-muted block">Accepted: {acceptedDate}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="pt-1">
        <ProgressCard
          milestones={caseItem.case_milestones || caseItem.case_progress || []}
          status={status}
          showLabel={true}
          size="md"
        />
      </div>

      {/* Action Buttons Toolbar */}
      <div className="pt-3 border-t border-border-subtle flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {/* View Details */}
          <button
            type="button"
            onClick={() => onViewDetails && onViewDetails(caseItem, 'details')}
            className="col-span-2 sm:col-span-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-navy-primary hover:bg-navy-secondary text-white text-xs font-bold transition shadow-2xs flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">visibility</span>
            <span>View Details</span>
          </button>

          {/* Timeline */}
          <button
            type="button"
            onClick={() => onOpenTimeline && onOpenTimeline(caseItem)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-bg-light hover:bg-gray-200 text-navy-primary text-xs font-bold transition border border-border-subtle flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">timeline</span>
            <span>Timeline</span>
          </button>

          {/* Documents */}
          <button
            type="button"
            onClick={() => onOpenDocuments && onOpenDocuments(caseItem)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-bg-light hover:bg-gray-200 text-navy-primary text-xs font-bold transition border border-border-subtle flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">folder</span>
            <span>Documents</span>
          </button>

          {/* Invoice / Financials */}
          <button
            type="button"
            onClick={() => onOpenInvoice && onOpenInvoice(caseItem)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-bg-light hover:bg-gray-200 text-navy-primary text-xs font-bold transition border border-border-subtle flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">receipt_long</span>
            <span>Invoice</span>
          </button>

          {/* Open Messages */}
          <button
            type="button"
            onClick={() => onOpenMessages && onOpenMessages(caseItem)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-bg-light hover:bg-gray-200 text-navy-primary text-xs font-bold transition border border-border-subtle flex items-center justify-center gap-1.5 relative"
          >
            <span className="material-symbols-outlined text-sm">chat</span>
            <span>Messages</span>
            {unreadCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center -top-1 -right-1 absolute shadow-xs animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Active Case Actions Toolbar */}
        {isActiveOrProgress && (
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
            <button
              type="button"
              onClick={() => onUpdateProgress && onUpdateProgress(caseItem)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-2xs flex items-center justify-center gap-1.5"
              title="Log new progress update for client timeline"
            >
              <span className="material-symbols-outlined text-sm">bolt</span>
              <span>Update Progress</span>
            </button>

            <button
              type="button"
              onClick={() => onSubmitDelivery && onSubmitDelivery(caseItem)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-navy-primary hover:bg-navy-secondary text-white text-xs font-bold transition shadow-2xs flex items-center justify-center gap-1.5"
              title="Submit deliverables & mark work ready for client review"
            >
              <span className="material-symbols-outlined text-sm">publish</span>
              <span>Submit Delivery</span>
            </button>

            <button
              type="button"
              onClick={() => onMarkComplete && onMarkComplete(caseItem)}
              disabled={isCompleting}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-2xs flex items-center justify-center gap-1.5"
              title="Mark this case as successfully resolved/completed"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>{isCompleting ? 'Closing...' : 'Mark Complete'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CaseCard;
