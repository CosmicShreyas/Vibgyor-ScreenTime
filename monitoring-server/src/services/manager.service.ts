import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { ConnectedClient, Employee, ManagerAccount } from '../database/schemas';

export class ManagerService {
  async authenticate(email: string, password: string) {
    const account = await ManagerAccount.findOne({ email: email.trim().toLowerCase() });
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) return null;
    const employee = await Employee.findById(account.employeeId).lean();
    return employee ? { account, employee } : null;
  }

  async getAssignedEmployeeIds(managerEmployeeId: string): Promise<mongoose.Types.ObjectId[]> {
    return (await Employee.find({ managerId: managerEmployeeId }).select('_id').lean()).map(e => e._id);
  }
  async getAssignedEmployeeNames(managerEmployeeId: string): Promise<string[]> {
    return (await Employee.find({ managerId: managerEmployeeId }).select('name').lean()).map(e => e.name);
  }

  async canAccessEmployee(managerEmployeeId: string, nameOrId: string): Promise<boolean> {
    const query: any = { managerId: managerEmployeeId };
    if (mongoose.Types.ObjectId.isValid(nameOrId)) query._id = nameOrId;
    else query.name = nameOrId;
    return !!(await Employee.exists(query));
  }

  async createOrUpdateManager(clientId: string, email: string, password: string) {
    const client = await ConnectedClient.findOne({ clientId }).lean();
    if (!client?.employeeName) throw new Error('This client needs an employee name before it can be a manager');
    const employee = await Employee.findOne({ name: client.employeeName });
    if (!employee) throw new Error('No employee record exists for this client yet');
    if (employee.managerId) throw new Error('An employee assigned to a manager cannot become a manager');
    const existingEmail = await ManagerAccount.findOne({ email: email.trim().toLowerCase(), employeeId: { $ne: employee._id } });
    if (existingEmail) throw new Error('That email is already used by another manager');
    const updates: any = { email: email.trim().toLowerCase() };
    if (password) updates.passwordHash = await bcrypt.hash(password, 12);
    const account = await ManagerAccount.findOneAndUpdate({ employeeId: employee._id }, { $set: updates }, { upsert: true, new: true });
    return { employee, account };
  }

  async listAssignments(managerEmployeeId: string, page = 1, limit = 10) {
    const safeLimit = Math.min(50, Math.max(1, limit)); const skip = Math.max(0, page - 1) * safeLimit;
    const query = { managerId: managerEmployeeId };
    const [items, total] = await Promise.all([Employee.find(query).sort({ name: 1 }).skip(skip).limit(safeLimit).lean(), Employee.countDocuments(query)]);
    return { items, total, page, limit: safeLimit };
  }

  async assign(managerEmployeeId: string, clientId: string) {
    const client = await ConnectedClient.findOne({ clientId }).lean();
    if (!client?.employeeName) throw new Error('Client has no employee name');
    const employee = await Employee.findOne({ name: client.employeeName });
    if (!employee) throw new Error('Employee record not found');
    if (employee._id.toString() === managerEmployeeId) throw new Error('A manager cannot manage themselves');
    if (await ManagerAccount.exists({ employeeId: employee._id })) throw new Error('A manager cannot be assigned as an employee');
    employee.managerId = new mongoose.Types.ObjectId(managerEmployeeId); await employee.save();
    return employee;
  }

  async remove(managerEmployeeId: string, employeeId: string) {
    return Employee.findOneAndUpdate({ _id: employeeId, managerId: managerEmployeeId }, { $unset: { managerId: 1 } }, { new: true });
  }
}
export const managerService = new ManagerService();
