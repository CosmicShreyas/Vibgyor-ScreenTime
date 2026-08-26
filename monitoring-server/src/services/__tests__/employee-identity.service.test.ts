import { Employee } from '../../database/schemas';
import { EmployeeService } from '../employee.service';

jest.mock('../../database/schemas', () => ({
  Employee: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
  ActivityLog: {},
  Screenshot: {},
}));
jest.mock('../../utils/logger');

const oid = (value: string) => ({ toString: () => value });

describe('EmployeeService stable employee identity', () => {
  const service = new EmployeeService();

  beforeEach(() => jest.clearAllMocks());

  it('adopts a legacy name-based record instead of creating a new employee', async () => {
    const legacy = {
      _id: oid('employee-record-1'),
      name: 'John Doe',
      firstSeen: new Date('2025-01-01T00:00:00Z'),
      lastSeen: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const adopted = { ...legacy, externalEmployeeId: 'EMP-42' };

    (Employee.findOne as jest.Mock)
      .mockResolvedValueOnce(null) // no employee-ID-aware record yet
      .mockResolvedValueOnce(legacy); // legacy record with historical data
    (Employee.findOneAndUpdate as jest.Mock).mockResolvedValue(adopted);

    const result = await service.upsertEmployee('John Doe', undefined, ' emp-42 ');

    expect(Employee.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: legacy._id },
      expect.objectContaining({
        $set: expect.objectContaining({ externalEmployeeId: 'EMP-42' }),
      }),
      { upsert: true, new: true }
    );
    expect(result.id).toBe('employee-record-1');
  });

  it('resolves a replacement device directly to the existing employee-ID record', async () => {
    const existing = {
      _id: oid('employee-record-1'),
      name: 'John Doe',
      externalEmployeeId: 'EMP-42',
      firstSeen: new Date(),
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (Employee.findOne as jest.Mock).mockResolvedValueOnce(existing);
    (Employee.findOneAndUpdate as jest.Mock).mockResolvedValue(existing);

    const result = await service.upsertEmployee('John Doe', undefined, 'EMP-42');

    expect(Employee.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: existing._id },
      expect.any(Object),
      { upsert: true, new: true }
    );
    expect(result.id).toBe('employee-record-1');
  });
});
