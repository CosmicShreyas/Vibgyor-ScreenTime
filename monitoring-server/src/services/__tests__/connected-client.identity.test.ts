import { ConnectedClient } from '../../database/schemas';
import { connectedClientService } from '../connected-client.service';

jest.mock('../../database/schemas', () => ({
  ConnectedClient: {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
  },
}));
jest.mock('../../utils/logger');

const id = (value: string) => ({ toString: () => value });

describe('ConnectedClient employee identity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retains the original record when a reinstallation reports the same employee ID', async () => {
    const original = {
      _id: id('original-record'),
      clientId: 'old-installation',
      employeeName: 'John Doe',
      employeeId: 'EMP-42',
      firstSeen: new Date('2025-01-01T00:00:00Z'),
    };
    const temporaryHeartbeatRow = {
      _id: id('temporary-row'),
      clientId: 'new-installation',
      employeeName: 'John Doe',
      firstSeen: new Date('2026-01-01T00:00:00Z'),
    };
    const updated = { ...original, clientId: 'new-installation', employeeIdKey: 'EMP-42' };

    (ConnectedClient.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([original]),
    });
    (ConnectedClient.findOne as jest.Mock).mockResolvedValue(temporaryHeartbeatRow);
    (ConnectedClient.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    (ConnectedClient.findOneAndUpdate as jest.Mock).mockResolvedValue(updated);

    const result = await connectedClientService.registerClient(
      'new-installation',
      'John Doe',
      ' emp-42 ',
      undefined,
      true
    );

    expect(ConnectedClient.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ['temporary-row'] },
    });
    expect(ConnectedClient.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: original._id },
      expect.objectContaining({
        $set: expect.objectContaining({
          clientId: 'new-installation',
          employeeId: 'emp-42',
          employeeIdKey: 'EMP-42',
        }),
      }),
      { upsert: true, new: true }
    );
    expect(result).toBe(updated);
  });

  it('does not let a superseded installation reclaim the active client identity', async () => {
    const active = {
      _id: id('original-record'),
      clientId: 'approved-new-installation',
      employeeName: 'John Doe',
      employeeId: 'EMP-42',
      employeeIdKey: 'EMP-42',
      firstSeen: new Date('2025-01-01T00:00:00Z'),
    };
    const staleTemporaryRow = {
      _id: id('stale-temporary-row'),
      clientId: 'superseded-old-installation',
      employeeName: 'John Doe',
    };
    (ConnectedClient.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([active]),
    });
    (ConnectedClient.findOne as jest.Mock).mockResolvedValue(staleTemporaryRow);
    (ConnectedClient.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    (ConnectedClient.findOneAndUpdate as jest.Mock).mockResolvedValue(active);

    await connectedClientService.registerClient(
      'superseded-old-installation',
      'John Doe',
      'EMP-42',
      { hostname: 'old-laptop' }
    );

    const update = (ConnectedClient.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(update.$set.clientId).toBeUndefined();
    expect(update.$set.systemInfo).toBeUndefined();
    expect(ConnectedClient.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ['stale-temporary-row'] },
    });
  });

  it('continues to key heartbeat-only registrations by installation ID', async () => {
    const created = { _id: id('new-record'), clientId: 'installation-1' };
    (ConnectedClient.findOne as jest.Mock).mockResolvedValue(null);
    (ConnectedClient.findOneAndUpdate as jest.Mock).mockResolvedValue(created);

    await connectedClientService.registerClient(' installation-1 ', 'Jane Doe');

    expect(ConnectedClient.find).not.toHaveBeenCalled();
    expect(ConnectedClient.findOneAndUpdate).toHaveBeenCalledWith(
      { clientId: 'installation-1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ clientId: 'installation-1' }),
      }),
      { upsert: true, new: true }
    );
  });
});
