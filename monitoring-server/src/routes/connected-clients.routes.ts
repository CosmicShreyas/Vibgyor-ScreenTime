import { Router } from 'express';
import { logger } from '../utils/logger';
import { connectedClientService } from '../services/connected-client.service';
import { managerService } from '../services/manager.service';
import { validateJwtToken, requireAdmin } from '../middleware/auth.middleware';
import { Employee, ManagerAccount } from '../database/schemas';

const router = Router();
router.use(validateJwtToken, requireAdmin);

const pageOf = (value: unknown, fallback: number) => Math.max(1, parseInt(String(value ?? fallback), 10) || fallback);

router.get('/by-employee/:name', async (req, res) => {
  try {
    const client = await connectedClientService.getClientByEmployeeName(req.params.name);
    if (!client) return res.status(404).json({ error: 'Connected client not found' });
    res.json({ systemInfo: client.systemInfo || null, resourceUsage: client.resourceUsage || null, lastSeen: client.lastSeen });
  } catch (error) { logger.error('Error fetching client telemetry', { error }); res.status(500).json({ error: 'Failed to fetch client telemetry' }); }
});

router.get('/', async (_req, res) => {
  try {
    const clients = await connectedClientService.getAllClients();
    const names = clients.map(c => c.employeeName).filter(Boolean) as string[];
    const employees = await Employee.find({ name: { $in: names } }).select('_id name managerId managerIds').lean();
    const employeeByName = new Map(employees.map(e => [e.name, e]));
    const employeeIds = employees.map(e => e._id);
    const accounts = await ManagerAccount.find({ employeeId: { $in: employeeIds } }).select('employeeId email').lean();
    const accountByEmployee = new Map(accounts.map(a => [a.employeeId.toString(), a]));
    const referencedManagerIds = Array.from(new Set(employees.flatMap(employee => [
      ...(employee.managerIds || []).map(id => id.toString()),
      ...(employee.managerId ? [employee.managerId.toString()] : []),
    ])));
    const referencedManagers = await Employee.find({ _id: { $in: referencedManagerIds } }).select('_id name').lean();
    const managerNameById = new Map(referencedManagers.map(manager => [manager._id.toString(), manager.name]));
    res.json({ success: true, clients: clients.map(client => {
      const employee = client.employeeName ? employeeByName.get(client.employeeName) : undefined;
      const account = employee ? accountByEmployee.get(employee._id.toString()) : undefined;
      const employeeManagerIds = employee ? Array.from(new Set([
        ...(employee.managerIds || []).map(id => id.toString()),
        ...(employee.managerId ? [employee.managerId.toString()] : []),
      ])) : [];
      return { clientId: client.clientId, employeeName: client.employeeName || null, employeeId: client.employeeId || null, firstSeen: client.firstSeen, lastSeen: client.lastSeen,
        recordId: employee?._id.toString() || null, managerIds: employeeManagerIds, managerNames: employeeManagerIds.map(id => managerNameById.get(id)).filter(Boolean),
        isManager: !!account, managerEmail: account?.email || null };
    }) });
  } catch (error) { logger.error('Error fetching connected clients', { error }); res.status(500).json({ error: 'Failed to fetch connected clients' }); }
});

router.post('/:clientId/manager', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(String(email || '')) || String(password || '').length < 8) return res.status(400).json({ error: 'A valid email and password of at least 8 characters are required' });
    const { employee, account } = await managerService.createOrUpdateManager(req.params.clientId, email, password);
    res.status(201).json({ employeeId: employee._id.toString(), email: account.email });
  } catch (error: any) { res.status(400).json({ error: error.message || 'Failed to configure manager' }); }
});

router.put('/:clientId/manager', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'A valid email is required' });
    const { employee, account } = await managerService.createOrUpdateManager(req.params.clientId, email, password || '');
    res.json({ employeeId: employee._id.toString(), email: account.email });
  } catch (error: any) { res.status(400).json({ error: error.message || 'Failed to update credentials' }); }
});

router.delete('/:clientId/manager', async (req, res) => {
  try {
    const employee = await managerService.revokeManager(req.params.clientId);
    res.json({ success: true, employeeId: employee._id.toString(), name: employee.name });
  } catch (error: any) {
    const message = error.message || 'Failed to revoke manager';
    res.status(message.includes('not found') ? 404 : 400).json({ error: message });
  }
});

router.get('/:clientId/manager/assignments', async (req, res) => {
  try {
    const client = await connectedClientService.getClientById(req.params.clientId);
    if (!client?.employeeName) return res.status(404).json({ error: 'Manager client not found' });
    const manager = await Employee.findOne({ name: client.employeeName }).lean();
    if (!manager || !(await ManagerAccount.exists({ employeeId: manager._id }))) return res.status(404).json({ error: 'Manager account not found' });
    const page = pageOf(req.query.page, 1), limit = pageOf(req.query.limit, 10);
    res.json(await managerService.listAssignments(manager._id.toString(), page, limit));
  } catch (error) { logger.error('Error listing manager assignments', { error }); res.status(500).json({ error: 'Failed to load assignments' }); }
});

router.post('/:clientId/manager/assignments', async (req, res) => {
  try {
    const managerClient = await connectedClientService.getClientById(req.params.clientId);
    if (!managerClient?.employeeName) return res.status(404).json({ error: 'Manager client not found' });
    const manager = await Employee.findOne({ name: managerClient.employeeName }).lean();
    if (!manager || !(await ManagerAccount.exists({ employeeId: manager._id }))) return res.status(404).json({ error: 'Manager account not found' });
    if (!req.body?.employeeClientId) return res.status(400).json({ error: 'employeeClientId is required' });
    const employee = await managerService.assign(manager._id.toString(), req.body.employeeClientId);
    res.status(201).json({ id: employee._id.toString(), name: employee.name });
  } catch (error: any) { res.status(400).json({ error: error.message || 'Failed to assign employee' }); }
});

router.delete('/:clientId/manager/assignments/:employeeId', async (req, res) => {
  try {
    const managerClient = await connectedClientService.getClientById(req.params.clientId);
    const manager = managerClient?.employeeName ? await Employee.findOne({ name: managerClient.employeeName }).lean() : null;
    if (!manager) return res.status(404).json({ error: 'Manager not found' });
    const employee = await managerService.remove(manager._id.toString(), req.params.employeeId);
    if (!employee) return res.status(404).json({ error: 'Assigned employee not found' });
    res.status(204).send();
  } catch (error) { res.status(500).json({ error: 'Failed to remove assignment' }); }
});

router.delete('/:clientId', async (req, res) => {
  try { const deleted = await connectedClientService.deleteClient(req.params.clientId); if (!deleted) return res.status(404).json({ error: 'Client not found' }); res.json({ success: true }); }
  catch (error) { logger.error('Error deleting client', { error }); res.status(500).json({ error: 'Failed to delete client' }); }
});
export default router;
