import os from 'os';
import fs from 'fs';
import { ServerStatistic } from '../database/schemas';
import { logger } from '../utils/logger';

export interface ServerResourceSample {
  timestamp: Date;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
}

/** A single, low-cost host sample per minute; history is retained for seven days. */
class ServerStatisticsService {
  private timer?: NodeJS.Timeout;
  private previousCpu?: { idle: number; total: number };

  private cpuPercent(): number {
    const totals = os.cpus().reduce((sum, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return { idle: sum.idle + cpu.times.idle, total: sum.total + total };
    }, { idle: 0, total: 0 });
    const previous = this.previousCpu;
    this.previousCpu = totals;
    if (!previous) return 0;
    const totalDelta = totals.total - previous.total;
    return totalDelta > 0 ? Math.round(((1 - (totals.idle - previous.idle) / totalDelta) * 100) * 10) / 10 : 0;
  }

  sample(): ServerResourceSample {
    const memoryTotalBytes = os.totalmem();
    const memoryUsedBytes = memoryTotalBytes - os.freemem();
    let diskTotalBytes = 0;
    let diskUsedBytes = 0;
    try {
      // statfs is available in supported Node versions and needs no elevated access.
      const stats = fs.statfsSync(process.cwd());
      diskTotalBytes = Number(stats.blocks) * Number(stats.bsize);
      diskUsedBytes = (Number(stats.blocks) - Number(stats.bfree)) * Number(stats.bsize);
    } catch (error) {
      logger.warn('Unable to collect server disk statistics', { error });
    }
    return { timestamp: new Date(), cpuPercent: this.cpuPercent(), memoryUsedBytes, memoryTotalBytes, diskUsedBytes, diskTotalBytes };
  }

  async collect(): Promise<ServerResourceSample> {
    const sample = this.sample();
    try {
      await ServerStatistic.create({ ...sample, expiresAt: new Date(sample.timestamp.getTime() + 7 * 24 * 60 * 60 * 1000) });
    } catch (error) {
      logger.warn('Unable to persist server resource statistics', { error });
    }
    return sample;
  }

  start(): void {
    if (this.timer) return;
    void this.collect();
    this.timer = setInterval(() => void this.collect(), 60_000);
    this.timer.unref();
    logger.info('Server resource statistics sampler started (60 second interval)');
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  async getHistory(hours = 24): Promise<ServerResourceSample[]> {
    const boundedHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    return ServerStatistic.find({ timestamp: { $gte: new Date(Date.now() - boundedHours * 60 * 60 * 1000) } })
      .sort({ timestamp: 1 }).select('-_id timestamp cpuPercent memoryUsedBytes memoryTotalBytes diskUsedBytes diskTotalBytes').lean();
  }
}

export const serverStatisticsService = new ServerStatisticsService();
