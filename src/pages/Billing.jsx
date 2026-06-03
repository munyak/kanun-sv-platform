import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/AuthContext'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtRelative(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return fmtDate(d)
}
function fmtMoney(cents) {
  if (cents == null) return '$0.00'
  return `$${(cents / 100).toFixed(2)}`
}
const daysOld = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
};
}

export default function Billing() {
  const { activeOrgId } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  // Payment recording
  const [showPayment, setShowPayment] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ method: 'check', reference: '', notes: '' })

  function showToast(msg, kind = 'success') { setToast({ msg, kind }); setTimeout(() => setToast(null), 4000) }

  useEffect(() => { if (activeOrgId) load() }, [activeOrgId])

  async function load() {
    setLoading(true)
    try {
      const [invRes, payRes] = await Promise.all([
        supabase.from('sv_invoices')
          .select('*, case:case_id(id, case_number, court_name, custodial_party_id, noncustodial_party_id, custodial:custodial_party_id(first_name, last_name), noncustodial:noncustodial_party_id(first_name, last_name)), visit:visit_id(scheduled_date)')
          .eq('org_id', activeOrgId)
          .order('created_at', { ascending: false }),
        supabase.from('sv_payments')
          .select('*')
          .eq('org_id', activeOrgId)
          .order('created_at', { ascending: false }),
      ])
      if (invRes.error) throw invRes.error
      setInvoices(invRes.data || [])
      setPayments(payRes.data || [])
    } catch (e) {
      showToast(e.message, 'error')
    } finally { setLoading(false) }
  }

  async function updateInvoiceStatus(invId, status) {
    setBusy(true)
    try {
      const patch = { status, updated_at: new Date().toISOString() }
      if (status === 'issued') patch.issued_at = new Date().toISOString()
      if (status === 'paid') patch.paid_at = new Date().toISOString()
      const { error } = await supabase.from('sv_invoices').update(patch).eq('id', invId)
      if (error) throw error
      showToast('Invoice updated')
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  async function recordPayment(invoiceId) {
    setBusy(true)
    try {
      const inv = invoices.find(i => i.id === invoiceId)
      if (!inv) throw new Error('Invoice not found')
      const { error: payErr } = await supabase.from('sv_payments').insert({
        org_id: activeOrgId,
        invoice_id: invoiceId,
        amount_cents: inv.amount_cents,
        payment_method: paymentForm.method,
        reference_number: paymentForm.reference || null,
        notes: paymentForm.notes || null,
        paid_at: new Date().toISOString(),
      })
      if (payErr) throw payErr
      await supabase.from('sv_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId)
      showToast('Payment recorded')
      setShowPayment(null)
      setPaymentForm({ method: 'check', reference: '', notes: '' })
      load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBusy(false) }
  }

  // Computed metrics
  const metrics = useMemo(() => {
    const draft = invoices.filter(i => i.status === 'draft')
    const issued = invoices.filter(i => i.status === 'issued')
    const paid = invoices.filter(i => i.status === 'paid')
    const overdue = issued.filter(i => daysOld(i.issued_at) > 30)
    const sumCents = (arr) => arr.reduce((s, i) => s + (i.amount_cents || 0), 0)

    const now = new Date()
    const thisMonth = invoices.filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at).getMonth() === now.getMonth() && new Date(i.paid_at).getFullYear() === now.getFullYear())
    const lastMonth = invoices.filter(i => {
      if (i.status !== 'paid' || !i.paid_at) return false
      const d = new Date(i.paid_at)
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear()
    })

    return {
      totalOutstanding: sumCents(issued),
      totalOverdue: sumCents(overdue),
      totalDraft: sumCents(draft),
      totalPaidThisMonth: sumCents(thisMonth),
      totalPaidLastMonth: sumCents(lastMonth),
      totalPaidAllTime: sumCents(paid),
      countDraft: draft.length,
      countIssued: issued.length,
      countOverdue: overdue.length,
      countPaid: paid.length,
    }
  }, [invoices])

  const filteredInvoices = useMemo(() => {
    if (filter === 'all') return invoices
    return invoices.filter(i => i.status === filter)
  }, [invoices, filter])

  // Aging buckets
  const aging = useMemo(() => {
    const issued = invoices.filter(i => i.status === 'issued')
    const buckets = { current: [], '1_30': [], '31_60': [], '61_90': [], over_90: [] }
    issued.forEach(i => {
      const d = daysOld(i.issued_at)
      if (d <= 0) buckets.current.push(i)
      else if (d <= 30) buckets['1_30'].push(i)
      else if (d <= 60) buckets['31_60'].push(i)
      else if (d <= 90) buckets['61_90'].push(i)
      else buckets.over_90.push(i)
    })
    return buckets
  }, [invoices])

  if (loading) return <div className="loading">Loading billing data...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <div className="page-subtitle">Invoices, payments, and revenue tracking</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'invoices', label: `Invoices (${invoices.length})` },
          { key: 'aging', label: 'Aging report' },
        ].map(t => (
          <button key={t.key} className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (
        <>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setTab('invoices'); setFilter('issued') }}>
              <div className="stat-card-head"><div className="stat-label">Outstanding</div></div>
              <div className="stat-value">{fmtMoney(metrics.totalOutstanding)}</div>
              <div className="stat-sub">{metrics.countIssued} issued invoice{metrics.countIssued !== 1 ? 's' : ''}</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setTab('invoices'); setFilter('draft') }}>
              <div className="stat-card-head"><div className="stat-label">Drafts</div></div>
              <div className="stat-value">{fmtMoney(metrics.totalDraft)}</div>
              <div className="stat-sub">{metrics.countDraft} draft{metrics.countDraft !== 1 ? 's' : ''} ready to issue</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-head"><div className="stat-label">Collected this month</div></div>
              <div className="stat-value">{fmtMoney(metrics.totalPaidThisMonth)}</div>
              <div className="stat-sub">{metrics.totalPaidLastMonth > 0 ? `${fmtMoney(metrics.totalPaidLastMonth)} last month` : 'No payments last month'}</div>
            </div>
            {metrics.countOverdue > 0 && (
              <div className="stat-card" style={{ cursor: 'pointer', borderColor: 'var(--error)' }} onClick={() => setTab('aging')}>
                <div className="stat-card-head"><div className="stat-label" style={{ color: 'var(--error)' }}>Overdue (30+ days)</div></div>
                <div className="stat-value" style={{ color: 'var(--error)' }}>{fmtMoney(metrics.totalOverdue)}</div>
                <div className="stat-sub">{metrics.countOverdue} overdue invoice{metrics.countOverdue !== 1 ? 's' : ''}</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-card-head"><div className="stat-label">Total collected</div></div>
              <div className="stat-value">{fmtMoney(metrics.totalPaidAllTime)}</div>
              <div className="stat-sub">{metrics.countPaid} paid invoice{metrics.countPaid !== 1 ? 's' : ''} all time</div>
            </div>
          </div>

          {/* Recent invoices */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent invoices</div>
              <button className="btn btn-sm btn-secondary" onClick={() => setTab('invoices')}>View all</button>
            </div>
            <div className="card-body-flush">
              <InvoiceTable invoices={invoices.slice(0, 10)} onStatusChange={updateInvoiceStatus} onRecordPayment={setShowPayment} busy={busy} />
            </div>
          </div>
        </>
      )}

      {/* ===== INVOICES ===== */}
      {tab === 'invoices' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">All invoices</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 160, height: 30, fontSize: 12 }}>
                <option value="all">All statuses</option>
                <option value="draft">Draft ({invoices.filter(i => i.status === 'draft').length})</option>
                <option value="issued">Issued ({invoices.filter(i => i.status === 'issued').length})</option>
                <option value="paid">Paid ({invoices.filter(i => i.status === 'paid').length})</option>
                <option value="void">Void ({invoices.filter(i => i.status === 'void').length})</option>
              </select>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{filteredInvoices.length} invoices</div>
            </div>
          </div>
          <div className="card-body-flush">
            <InvoiceTable invoices={filteredInvoices} onStatusChange={updateInvoiceStatus} onRecordPayment={setShowPayment} busy={busy} />
          </div>
        </div>
      )}

      {/* ===== AGING ===== */}
      {tab === 'aging' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Accounts receivable aging</div></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                {[
                  { label: 'Current', items: aging.current },
                  { label: '1–30 days', items: aging['1_30'] },
                  { label: '31–60 days', items: aging['31_60'] },
                  { label: '61–90 days', items: aging['61_90'] },
                  { label: '90+ days', items: aging.over_90 },
                ].map((b, i) => {
                  const sum = b.items.reduce((s, inv) => s + (inv.amount_cents || 0), 0)
                  const isOverdue = i >= 2
                  return (
                    <div key={b.label} style={{ background: 'var(--bg-card)', padding: 20, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 550, color: isOverdue && sum > 0 ? 'var(--error)' : 'var(--text-primary)', letterSpacing: '-0.02em' }}>{fmtMoney(sum)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{b.items.length} invoice{b.items.length !== 1 ? 's' : ''}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Overdue detail */}
          {(aging['31_60'].length + aging['61_90'].length + aging.over_90.length) > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--error)' }}>Overdue invoices</div>
              </div>
              <div className="card-body-flush">
                <InvoiceTable
                  invoices={[...aging['31_60'], ...aging['61_90'], ...aging.over_90]}
                  onStatusChange={updateInvoiceStatus}
                  onRecordPayment={setShowPayment}
                  busy={busy}
                  showAge
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment recording modal */}
      {showPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPayment(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-pop)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 550, marginBottom: 4 }}>Record payment</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              {showPayment.invoice_number} — {fmtMoney(showPayment.amount_cents)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="form-label">Payment method</label>
                <select className="form-select" value={paymentForm.method} onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}>
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                  <option value="credit_card">Credit card</option>
                  <option value="ach">ACH / bank transfer</option>
                  <option value="venmo">Venmo</option>
                  <option value="zelle">Zelle</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="form-label">Reference number (optional)</label>
                <input className="form-input" value={paymentForm.reference} onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} placeholder="Check #, transaction ID, etc." />
              </div>
              <div>
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes" />
              </div>
            </div>
            <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowPayment(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => recordPayment(showPayment.id)} disabled={busy}>
                {busy ? 'Recording...' : `Record ${fmtMoney(showPayment.amount_cents)} payment`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

/* ---- Invoice table component ---- */
function InvoiceTable({ invoices, onStatusChange, onRecordPayment, busy, showAge }) {
  if (!invoices.length) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No invoices</div>
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Case</th>
          <th>Party</th>
          <th>Visit date</th>
          <th>Amount</th>
          <th>Status</th>
          {showAge && <th>Age</th>}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map(inv => {
          const party = inv.case?.custodial || inv.case?.noncustodial
          const age = inv.issued_at ? daysOld(inv.issued_at) : 0
          return (
            <tr key={inv.id}>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{inv.invoice_number}</td>
              <td className="cell-strong">{inv.case?.case_number || '—'}</td>
              <td>{party ? `${party.first_name} ${party.last_name}` : '—'}</td>
              <td className="cell-muted">{inv.visit?.scheduled_date ? fmtDate(inv.visit.scheduled_date) : '—'}</td>
              <td style={{ fontWeight: 500 }}>{fmtMoney(inv.amount_cents)}</td>
              <td><InvoiceStatusBadge status={inv.status} /></td>
              {showAge && <td style={{ color: age > 60 ? 'var(--error)' : age > 30 ? 'var(--warning)' : 'var(--text-tertiary)', fontSize: 12 }}>{age}d</td>}
              <td>
                <div className="btn-group">
                  {inv.status === 'draft' && <button className="btn btn-sm btn-secondary" onClick={() => onStatusChange(inv.id, 'issued')} disabled={busy}>Issue</button>}
                  {inv.status === 'issued' && <button className="btn btn-sm btn-primary" onClick={() => onRecordPayment(inv)} disabled={busy}>Record payment</button>}
                  {(inv.status === 'draft' || inv.status === 'issued') && <button className="btn btn-sm btn-ghost" onClick={() => onStatusChange(inv.id, 'void')} disabled={busy}>Void</button>}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function InvoiceStatusBadge({ status }) {
  const map = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' }
  return <span className={`badge badge-${map[status] || 'gray'}`}>{(status || '—').replace(/_/g, ' ')}</span>
}

function daysOld(dateStr) {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}
