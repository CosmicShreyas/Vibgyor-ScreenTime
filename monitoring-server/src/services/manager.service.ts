import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { ConnectedClient, Employee, ManagerAccount } from '../database/schemas';

const directReportQuery = (managerEmployeeIds: mongoose.Types.ObjectId[]) => ({
  $or: [
    { managerIds: { $in: managerEmployeeIds } },
    // Read the legacy field until every existing employee is touched/migrated.
    { managerId: { $in: managerEmployeeIds } },
  ],
});

interface ManagerAssignmentPage {
  items: Array<{ _id: mongoose.Types.ObjectId; name: string; isManager: boolean; managerEmail: string | null }>;
  total: number;
  page: number;
  limit: number;
}

export class ManagerService {
  async authenticate(email: string, password: string) {
    const account = await ManagerAccount.findOne({ email: email.trim().toLowerCase() });
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) return null;
    const employee = await Employee.findById(account.employeeId).lean();
    return employee ? { account, employee } : null;
  }

  /** Direct + nested reports. A manager assigned below another manager exposes their subtree. */
  async getAssignedEmployeeIds(managerEmployeeId: string): Promise<mongoose.Types.ObjectId[]> {
    if (!mongoose.Types.ObjectId.isValid(managerEmployeeId)) return [];

    const root = new mongoose.Types.ObjectId(managerEmployeeId);
    const visited = new Set<string>([root.toString()]);
    const result: mongoose.Types.ObjectId[] = [];
    let frontier = [root];

    while (frontier.length > 0) {
      const children = await Employee.find(directReportQuery(frontier)).select('_id').lean();
      const next: mongoose.Types.ObjectId[] = [];
      for (const child of children) {
        const id = child._id.toString();
        if (visited.has(id)) continue;
        visited.add(id);
        result.push(child._id);
        next.push(child._id);
      }
      frontier = next;
    }

    return result;
  }

  async getAssignedEmployeeNames(managerEmployeeId: string): Promise<string[]> {
    const ids = await this.getAssignedEmployeeIds(managerEmployeeId);
    return (await Employee.find({ _id: { $in: ids } }).select('name').lean()).map(employee => employee.name);
  }

  async canAccessEmployee(managerEmployeeId: string, nameOrId: string): Promise<boolean> {
    const assignedIds = await this.getAssignedEmployeeIds(managerEmployeeId);
    if (mongoose.Types.ObjectId.isValid(nameOrId)) {
      return assignedIds.some(id => id.toString() === nameOrId);
    }
    return !!(await Employee.exists({ _id: { $in: assignedIds }, name: nameOrId }));
  }

  async createOrUpdateManager(clientId: string, email: string, password: string) {
    const client = await ConnectedClient.findOne({ clientId }).lean();
    if (!client?.employeeName) throw new Error('This client needs an employee name before it can be a manager');
    const employee = await Employee.findOne({ name: client.employeeName });
    if (!employee) throw new Error('No employee record exists for this client yet');

    const normalizedEmail = email.trim().toLowerCase();
    const existingEmail = await ManagerAccount.findOne({ email: normalizedEmail, employeeId: { $ne: employee._id } });
    if (existingEmail) throw new Error('That email is already used by another manager');

    const existingAccount = await ManagerAccount.findOne({ employeeId: employee._id });
    if (!existingAccount && !password) throw new Error('A password is required when creating a manager');

    const updates: { email: string; passwordHash?: string } = { email: normalizedEmail };
    if (password) updates.passwordHash = await bcrypt.hash(password, 12);
    const account = await ManagerAccount.findOneAndUpdate(
      { employeeId: employee._id },
      { $set: updates },
      { upsert: true, new: true, runValidators: true }
    );
    return { employee, account };
  }

  async revokeManager(clientId: string) {
    const client = await ConnectedClient.findOne({ clientId }).lean();
    if (!client?.employeeName) throw new Error('Manager client not found');
    const employee = await Employee.findOne({ name: client.employeeName }).lean();
    if (!employee) throw new Error('Employee record not found');

    const deleted = await ManagerAccount.deleteOne({ employeeId: employee._id });
    if (!deleted.deletedCount) throw new Error('Manager account not found');

    // Remove this person as a manager from all direct reports. Their own upstream
    // manager assignments remain intact, so they become an ordinary team member.
    await Promise.all([
      Employee.updateMany({ managerIds: employee._id }, { $pull: { managerIds: employee._id } }),
      Employee.updateMany({ managerId: employee._id }, { $unset: { managerId: 1 } }),
    ]);
    return employee;
  }

  async listAssignments(managerEmployeeId: string, page = 1, limit = 10): Promise<ManagerAssignmentPage> {
    if (!mongoose.Types.ObjectId.isValid(managerEmployeeId)) return { items: [], total: 0, page: 1, limit: 10 };
    const managerId = new mongoose.Types.ObjectId(managerEmployeeId);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;
    const query = directReportQuery([managerId]);
    const [employees, total] = await Promise.all([
      Employee.find(query).sort({ name: 1 }).skip(skip).limit(safeLimit).lean(),
      Employee.countDocuments(query),
    ]);
    const managerAccounts = await ManagerAccount.find({ employeeId: { $in: employees.map(employee => employee._id) } })
      .select('employeeId email').lean();
    const accountByEmployee = new Map(managerAccounts.map(account => [account.employeeId.toString(), account]));
    const items = employees.map(employee => {
      const account = accountByEmployee.get(employee._id.toString());
      return { _id: employee._id, name: employee.name, isManager: !!account, managerEmail: account?.email || null };
    });
    return { items, total, page: safePage, limit: safeLimit };
  }

  async assign(managerEmployeeId: string, clientId: string) {
    if (!mongoose.Types.ObjectId.isValid(managerEmployeeId)) throw new Error('Manager not found');
    const managerId = new mongoose.Types.ObjectId(managerEmployeeId);
    const client = await ConnectedClient.findOne({ clientId }).lean();
    if (!client?.employeeName) throw new Error('Client has no employee name');
    const employee = await Employee.findOne({ name: client.employeeName });
    if (!employee) throw new Error('Employee record not found');
    if (employee._id.equals(managerId)) throw new Error('A manager cannot manage themselves');

    // If the target already manages this manager (directly or through another
    // manager), assigning it below the manager would create a hierarchy cycle.
    const targetDescendants = await this.getAssignedEmployeeIds(employee._id.toString());
    if (targetDescendants.some(id => id.equals(managerId))) {
      throw new Error('This assignment would create a manager hierarchy cycle');
    }

    const update: any = { $addToSet: { managerIds: managerId } };
    if (employee.managerId) {
      // Once touched, migrate the legacy manager into the array as well.
      update.$addToSet = { managerIds: { $each: [employee.managerId, managerId] } };
      update.$unset = { managerId: 1 };
    }
    await Employee.updateOne({ _id: employee._id }, update);
    return Employee.findById(employee._id);
  }

  async remove(managerEmployeeId: string, employeeId: string) {
    if (!mongoose.Types.ObjectId.isValid(managerEmployeeId) || !mongoose.Types.ObjectId.isValid(employeeId)) return null;
    const managerId = new mongoose.Types.ObjectId(managerEmployeeId);
    const employee = await Employee.findOne({ _id: employeeId, ...directReportQuery([managerId]) });
    if (!employee) return null;

    const update: any = { $pull: { managerIds: managerId } };
    if (employee.managerId?.equals(managerId)) update.$unset = { managerId: 1 };
    return Employee.findByIdAndUpdate(employee._id, update, { new: true });
  }
}

export const managerService = new ManagerService();
