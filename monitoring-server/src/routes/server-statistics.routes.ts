import { Router } from 'express';
import { validateJwtToken, requireAdmin } from '../middleware/auth.middleware';
import { serverStatisticsService } from '../services/server-statistics.service';

const router = Router();
router.use(validateJwtToken, requireAdmin);

router.get('/', async (req, res) => {
  const history = await serverStatisticsService.getHistory(Number(req.query.hours));
  res.json({ intervalSeconds: 60, retentionHours: 168, history });
});

export default router;
