import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { validateJwtToken } from '../middleware/auth.middleware';
import { analyticsService } from '../services/analytics.service';
import { alertsService } from '../services/alerts.service';
import { wellbeingService } from '../services/wellbeing.service';
import { toDateStr, addDaysStr } from '../utils/timezone';

const router = Router();

/** GET /api/analytics/focus/:name?days=7 — focus & flow metrics for an employee. */
router.get('/wellbeing/focus/:name', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt((req.query.days as string) || '7', 10)));
    const endDate = req.query.endDate as string | undefined;
    const result = await wellbeingService.getFocus(req.params.name, days, endDate);
    if (!result) return res.status(404).json({ error: 'Employee not found' });
    res.json(result);
  } catch (error: any) {
    logger.error('Error fetching focus metrics:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch focus metrics' });
  }
});

/** GET /api/analytics/wellbeing/burnout?days=7 — team burnout radar. */
router.get('/wellbeing/burnout', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt((req.query.days as string) || '7', 10)));
    const endDate = req.query.endDate as string | undefined;
    res.json(await wellbeingService.getBurnoutRadar(days, endDate));
  } catch (error: any) {
    logger.error('Error fetching burnout radar:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch burnout radar' });
  }
});

/** GET /api/analytics/wellbeing/anomalies — per-employee deviations vs baseline. */
router.get('/wellbeing/anomalies', validateJwtToken, async (_req: Request, res: Response) => {
  try {
    res.json(await wellbeingService.getAnomalies());
  } catch (error: any) {
    logger.error('Error fetching anomalies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch anomalies' });
  }
});

/** GET /api/analytics/wellbeing/team-pulse — team percentile comparison. */
router.get('/wellbeing/team-pulse', validateJwtToken, async (_req: Request, res: Response) => {
  try {
    res.json(await wellbeingService.getTeamPulse());
  } catch (error: any) {
    logger.error('Error fetching team pulse:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch team pulse' });
  }
});

/**
 * GET /api/analytics/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Team productivity overview for an inclusive date range.
 */
router.get('/overview', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { date, startDate, endDate } = req.query;
    const start = (startDate || date) as string | undefined;
    const overview = await analyticsService.getTeamOverview(start, endDate as string | undefined);
    res.json(overview);
  } catch (error: any) {
    logger.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch overview' });
  }
});

/**
 * GET /api/analytics/trend?days=7&employee=Name&endDate=YYYY-MM-DD
 * Daily productivity trend for the team or a specific employee. `endDate` lets a
 * from–to range that does not end today anchor the trend window.
 */
router.get('/trend', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt((req.query.days as string) || '7', 10)));
    const employee = req.query.employee as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const trend = await analyticsService.getProductivityTrend(days, employee, endDate);
    res.json(trend);
  } catch (error: any) {
    logger.error('Error fetching productivity trend:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch trend' });
  }
});

/**
 * GET /api/analytics/focus/:name?date=YYYY-MM-DD
 * Focus-time blocks for an employee on a day.
 */
router.get('/focus/:name', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || toDateStr(new Date());
    const result = await analyticsService.getFocusBlocks(req.params.name, date);
    if (!result) return res.status(404).json({ error: 'Employee not found' });
    res.json(result);
  } catch (error: any) {
    logger.error('Error fetching focus blocks:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch focus blocks' });
  }
});

/**
 * GET /api/analytics/insights?date=YYYY-MM-DD
 * Natural-language insights for a day.
 */
router.get('/insights', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { date, startDate, endDate } = req.query;
    const start = (startDate || date) as string | undefined;
    const insights = await analyticsService.getInsights(start, endDate as string | undefined);
    res.json({ insights });
  } catch (error: any) {
    logger.error('Error generating insights:', error);
    res.status(500).json({ error: error.message || 'Failed to generate insights' });
  }
});

/**
 * GET /api/analytics/attendance/:name?startDate=&endDate=
 * Per-day attendance for an employee. Defaults to the last 30 days.
 */
router.get('/attendance/:name', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const endDate = (req.query.endDate as string) || toDateStr(new Date());
    const startDate = (req.query.startDate as string) || addDaysStr(endDate, -29);
    const result = await analyticsService.getAttendance(req.params.name, startDate, endDate);
    if (!result) return res.status(404).json({ error: 'Employee not found' });
    res.json(result);
  } catch (error: any) {
    logger.error('Error fetching attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attendance' });
  }
});

/**
 * GET /api/analytics/alerts?date=YYYY-MM-DD or ?startDate=&endDate=
 * Active alerts evaluated against configured thresholds. Accepts either a single
 * `date`, or a `startDate`/`endDate` range (aggregated across the range).
 */
router.get('/alerts', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { date, startDate, endDate } = req.query;
    const start = (startDate || date) as string | undefined;
    const alerts = await alertsService.evaluate(start, endDate as string | undefined);
    res.json({ alerts });
  } catch (error: any) {
    logger.error('Error evaluating alerts:', error);
    res.status(500).json({ error: error.message || 'Failed to evaluate alerts' });
  }
});

router.post('/alerts/:id/dismiss', validateJwtToken, async (req: Request, res: Response) => {
  try {
    await alertsService.dismiss(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    logger.error('Error dismissing alert:', error);
    res.status(500).json({ error: error.message || 'Failed to dismiss alert' });
  }
});

/**
 * GET /api/analytics/alerts/config  &  PUT to update thresholds.
 */
router.get('/alerts/config', validateJwtToken, async (_req: Request, res: Response) => {
  try {
    res.json(await alertsService.getConfig());
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch alerts config' });
  }
});

router.put('/alerts/config', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const updated = await alertsService.updateConfig(req.body || {});
    res.json(updated);
  } catch (error: any) {
    logger.error('Error updating alerts config:', error);
    res.status(500).json({ error: error.message || 'Failed to update alerts config' });
  }
});

export default router;
