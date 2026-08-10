import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  UserRoundCheck,
  UserRoundMinus,
  UserX,
  X,
} from 'lucide-react'
import api from '../../services/api'
import ConfirmationModal from '../ConfirmationModal'
import toast from 'react-hot-toast'
import Pagination, { usePagination } from '../Pagination'

interface ConnectedClient {
  clientId: string
  employeeName: string | null
  employeeId: string | null
  recordId: string | null
  managerIds: string[]
  managerNames: string[]
  isManager: boolean
  managerEmail: string | null
}

interface Assignment {
  _id: string
  name: string
  isManager: boolean
  managerEmail: string | null
}

interface AssignmentPage {
  items: Assignment[]
  total: number
  page: number
  limit: number
}

const emptyCredential = { client: null as ConnectedClient | null, email: '', password: '' }
const emptyAssignments: AssignmentPage = { items: [], total: 0, page: 1, limit: 10 }
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300/30 bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50'
const inputClass = 'mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--primary)_25%,transparent)]'

const ConnectedClientsTab: React.FC = () => {
  const [clients, setClients] = useState<ConnectedClient[]>([])
  const [loading, setLoading] = useState(true)
  const [credential, setCredential] = useState(emptyCredential)
  const [assignmentFor, setAssignmentFor] = useState<ConnectedClient | null>(null)
  const [assignments, setAssignments] = useState<AssignmentPage>(emptyAssignments)
  const [selectedClient, setSelectedClient] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, clientId: '', employeeName: '' })
  const [revokeConfirmation, setRevokeConfirmation] = useState({ isOpen: false, client: null as ConnectedClient | null })
  const pagination = usePagination(clients, 10)

  const fetchClients = async () => {
    try {
      setLoading(true)
      setClients((await api.get('/connected-clients')).data.clients || [])
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch connected clients')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClients() }, [])

  const loadAssignments = async (manager: ConnectedClient, page = 1, limit = 10) => {
    try {
      const response = await api.get(`/connected-clients/${manager.clientId}/manager/assignments`, { params: { page, limit } })
      setAssignments(response.data)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load team')
    }
  }

  useEffect(() => {
    if (assignmentFor) loadAssignments(assignmentFor)
    else setAssignments(emptyAssignments)
    setSelectedClient('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentFor?.clientId])

  const available = useMemo(() => {
    if (!assignmentFor?.recordId) return []
    return clients.filter(client =>
      client.employeeName &&
      client.recordId &&
      client.recordId !== assignmentFor.recordId &&
      !client.managerIds.includes(assignmentFor.recordId!)
    )
  }, [clients, assignmentFor])

  const saveCredentials = async () => {
    if (!credential.client) return
    try {
      await api[credential.client.isManager ? 'put' : 'post'](
        `/connected-clients/${credential.client.clientId}/manager`,
        { email: credential.email, password: credential.password }
      )
      toast.success(credential.client.isManager ? 'Manager credentials updated' : 'Manager role granted')
      setCredential(emptyCredential)
      fetchClients()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not save credentials')
    }
  }

  const addEmployee = async () => {
    if (!assignmentFor || !selectedClient) return
    try {
      await api.post(`/connected-clients/${assignmentFor.clientId}/manager/assignments`, { employeeClientId: selectedClient })
      setSelectedClient('')
      await loadAssignments(assignmentFor, assignments.page)
      await fetchClients()
      toast.success('Reporting relationship added')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not add assignment')
    }
  }

  const removeEmployee = async (employeeId: string) => {
    if (!assignmentFor) return
    try {
      await api.delete(`/connected-clients/${assignmentFor.clientId}/manager/assignments/${employeeId}`)
      const nextPage = assignments.items.length === 1 && assignments.page > 1 ? assignments.page - 1 : assignments.page
      await loadAssignments(assignmentFor, nextPage)
      await fetchClients()
      toast.success('Reporting relationship removed')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not remove assignment')
    }
  }

  const revokeManager = async () => {
    const client = revokeConfirmation.client
    if (!client) return
    try {
      await api.delete(`/connected-clients/${client.clientId}/manager`)
      if (assignmentFor?.clientId === client.clientId) setAssignmentFor(null)
      setRevokeConfirmation({ isOpen: false, client: null })
      await fetchClients()
      toast.success('Manager role revoked')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not revoke manager')
    }
  }

  if (loading) return <div className="p-8 text-center text-[var(--muted-foreground)]">Loading connected clients...</div>

  return (
    <div className="p-1">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Connected Clients</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Create manager logins, build manager hierarchies, and assign employees to one or more managers.
          </p>
        </div>
        <button onClick={fetchClients} className={primaryButton}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_80%,transparent)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-[var(--secondary)] text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              <tr><th className="p-3">Client</th><th className="p-3">Employee</th><th className="p-3">Role & reporting</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {pagination.pageItems.map(client => (
                <tr key={client.clientId} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--accent)]/50">
                  <td className="p-3 font-mono">{client.clientId.slice(0, 8)}...</td>
                  <td className="p-3">
                    <b>{client.employeeName || 'Not set'}</b>
                    <div className="text-xs text-[var(--muted-foreground)]">{client.employeeId || 'No employee ID'}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {client.isManager && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400">Manager · {client.managerEmail}</span>}
                      {client.managerNames.length > 0 ? (
                        <span className="text-xs text-[var(--muted-foreground)]">Reports to {client.managerNames.join(', ')}</span>
                      ) : !client.isManager ? <span className="text-[var(--muted-foreground)]">Unassigned</span> : null}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setCredential({ client, email: client.managerEmail || '', password: '' })}
                        disabled={!client.employeeName}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400/35 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {client.isManager ? <KeyRound size={15} /> : <UserRoundCheck size={15} />}
                        {client.isManager ? 'Credentials' : 'Make Manager'}
                      </button>
                      {client.isManager && (
                        <>
                          <button onClick={() => setAssignmentFor(client)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-xs font-semibold transition hover:border-[var(--primary)]"><Plus size={15} /> Team</button>
                          <button onClick={() => setRevokeConfirmation({ isOpen: true, client })} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20"><UserX size={15} /> Revoke</button>
                        </>
                      )}
                      <button onClick={() => setDeleteConfirmation({ isOpen: true, clientId: client.clientId, employeeName: client.employeeName || client.clientId })} className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20" title="Delete client"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page} pageSize={pagination.pageSize} totalItems={clients.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="clients" />
      </div>

      {credential.client && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-blue-300/20 bg-[color-mix(in_oklab,var(--card)_94%,#071222)] p-6 shadow-2xl shadow-blue-950/60">
            <div className="mb-5 flex justify-between">
              <div><h3 className="font-bold">{credential.client.isManager ? 'Edit Credentials' : 'Grant Manager Role'}</h3><p className="text-sm text-[var(--muted-foreground)]">{credential.client.employeeName}</p></div>
              <button className="rounded-lg p-2 transition hover:bg-[var(--accent)]" onClick={() => setCredential(emptyCredential)}><X /></button>
            </div>
            <label className="block text-sm font-medium">Email<input className={inputClass} placeholder="manager@company.com" type="email" value={credential.email} onChange={event => setCredential(value => ({ ...value, email: event.target.value }))} /></label>
            <label className="mt-4 block text-sm font-medium">{credential.client.isManager ? 'New password (leave blank to keep current)' : 'Password'}<input className={inputClass} placeholder="At least 8 characters" type="password" value={credential.password} onChange={event => setCredential(value => ({ ...value, password: event.target.value }))} /></label>
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">A manager may also report to other managers. Passwords are securely hashed and cannot be displayed.</p>
            <button onClick={saveCredentials} className={`${primaryButton} mt-5 w-full`}>Save manager</button>
          </div>
        </div>, document.body
      )}

      {assignmentFor && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-blue-300/20 bg-[var(--card)] p-6 shadow-2xl">
            <div className="mb-5 flex justify-between">
              <div><h3 className="font-bold">{assignmentFor.employeeName}'s direct team</h3><p className="text-sm text-[var(--muted-foreground)]">Add employees or other managers. Nested manager teams are visible automatically.</p></div>
              <button className="rounded-lg p-2 hover:bg-[var(--accent)]" onClick={() => setAssignmentFor(null)}><X /></button>
            </div>
            <div className="flex items-end gap-2">
              <label className="block flex-1 text-sm font-medium">Employee or manager to add
                <div className="relative mt-2">
                  <select className="w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 pr-10 text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--primary)_25%,transparent)]" value={selectedClient} onChange={event => setSelectedClient(event.target.value)}>
                    <option value="">Select a connected client...</option>
                    {available.map(client => <option key={client.clientId} value={client.clientId}>{client.employeeName}{client.isManager ? ' — Manager' : ''} ({client.employeeId || client.clientId.slice(0, 8)})</option>)}
                  </select>
                  <ChevronDown size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--primary)]" />
                </div>
              </label>
              <button className={primaryButton} onClick={addEmployee} disabled={!selectedClient}>Add</button>
            </div>
            <div className="mt-5 min-h-0 overflow-y-auto divide-y divide-[var(--border)]">
              {assignments.items.map(employee => (
                <div className="flex items-center justify-between py-3" key={employee._id}>
                  <span>{employee.name}{employee.isManager && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400">Manager</span>}</span>
                  <button onClick={() => removeEmployee(employee._id)} className="text-sm font-semibold text-red-400"><UserRoundMinus className="mr-1 inline" size={15} /> Remove</button>
                </div>
              ))}
              {assignments.items.length === 0 && <p className="py-5 text-center text-sm text-[var(--muted-foreground)]">No direct reports yet.</p>}
            </div>
            {assignments.total > assignments.limit && <Pagination page={assignments.page} pageSize={assignments.limit} totalItems={assignments.total} onPageChange={page => loadAssignments(assignmentFor, page, assignments.limit)} onPageSizeChange={size => loadAssignments(assignmentFor, 1, size)} itemLabel="assignments" />}
          </div>
        </div>, document.body
      )}

      <ConfirmationModal
        isOpen={revokeConfirmation.isOpen}
        onClose={() => setRevokeConfirmation({ isOpen: false, client: null })}
        onConfirm={revokeManager}
        title="Revoke Manager Role"
        message={`Revoke manager access from ${revokeConfirmation.client?.employeeName || 'this employee'}? Their login and downstream team assignments will be removed, but the employee, client, history, and their own reporting managers will remain.`}
        confirmText="Revoke Manager"
        cancelText="Cancel"
        type="warning"
      />
      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, clientId: '', employeeName: '' })}
        onConfirm={async () => {
          await api.delete(`/connected-clients/${deleteConfirmation.clientId}`)
          setDeleteConfirmation({ isOpen: false, clientId: '', employeeName: '' })
          fetchClients()
        }}
        title="Delete Connected Client"
        message={`Delete ${deleteConfirmation.employeeName} and associated data?`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  )
}

export default ConnectedClientsTab
