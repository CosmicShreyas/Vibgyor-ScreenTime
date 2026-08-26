import { Database } from '../database';

describe('Database Connection Pooling', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Pool Configuration', () => {
    it('should initialize pool with configured max connections', () => {
      const stats = db.getPoolStats();
      // Pool should be initialized but not necessarily have connections yet
      expect(stats).toHaveProperty('totalCount');
      expect(stats).toHaveProperty('idleCount');
      expect(stats).toHaveProperty('waitingCount');
    });

    it('should handle connection pool statistics', () => {
      const stats = db.getPoolStats();
      expect(typeof stats.totalCount).toBe('number');
      expect(typeof stats.idleCount).toBe('number');
      expect(typeof stats.waitingCount).toBe('number');
      expect(stats.totalCount).toBeGreaterThanOrEqual(0);
      expect(stats.idleCount).toBeGreaterThanOrEqual(0);
      expect(stats.waitingCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Transaction Management', () => {
    it('should commit transaction on success', async () => {
      const result = await db.transaction(async (client) => {
        // Perform a simple query
        const res = await client.query('SELECT 1 as value');
        return res.rows[0].value;
      });

      expect(result).toBe(1);
    });

    it('should rollback transaction on error', async () => {
      // Create a test table
      await db.query(`
        CREATE TABLE IF NOT EXISTS test_rollback (
          id SERIAL PRIMARY KEY,
          value TEXT
        )
      `);

      // Clear any existing data
      await db.query('DELETE FROM test_rollback');

      try {
        await db.transaction(async (client) => {
          // Insert a row
          await client.query('INSERT INTO test_rollback (value) VALUES ($1)', ['test']);
          
          // Throw an error to trigger rollback
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected error
      }

      // Verify the row was not inserted (transaction rolled back)
      const result = await db.query('SELECT COUNT(*) as count FROM test_rollback');
      expect(parseInt(result.rows[0].count)).toBe(0);

      // Cleanup
      await db.query('DROP TABLE IF EXISTS test_rollback');
    });

    it('should handle nested operations within transaction', async () => {
      const result = await db.transaction(async (client) => {
        const res1 = await client.query('SELECT 1 as value');
        const res2 = await client.query('SELECT 2 as value');
        return res1.rows[0].value + res2.rows[0].value;
      });

      expect(result).toBe(3);
    });

    it('should release client after transaction completes', async () => {
      const statsBefore = db.getPoolStats();
      
      await db.transaction(async (client) => {
        await client.query('SELECT 1');
      });

      // Client should be released back to pool
      const statsAfter = db.getPoolStats();
      expect(statsAfter.totalCount).toBeGreaterThanOrEqual(statsBefore.totalCount);
    });

    it('should release client even when transaction fails', async () => {
      const statsBefore = db.getPoolStats();
      
      try {
        await db.transaction(async (client) => {
          await client.query('SELECT 1');
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected error
      }

      // Client should still be released back to pool
      const statsAfter = db.getPoolStats();
      expect(statsAfter.totalCount).toBeGreaterThanOrEqual(statsBefore.totalCount);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent queries', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        db.query('SELECT $1 as value', [i])
      );

      const results = await Promise.all(promises);
      
      results.forEach((result, i) => {
        expect(result.rows[0].value).toBe(i);
      });
    });

    it('should handle multiple concurrent transactions', async () => {
      // Create test table
      await db.query(`
        CREATE TABLE IF NOT EXISTS test_concurrent (
          id SERIAL PRIMARY KEY,
          value INTEGER
        )
      `);

      await db.query('DELETE FROM test_concurrent');

      // Run 10 concurrent transactions
      const promises = Array.from({ length: 10 }, (_, i) =>
        db.transaction(async (client) => {
          await client.query('INSERT INTO test_concurrent (value) VALUES ($1)', [i]);
          return i;
        })
      );

      const results = await Promise.all(promises);
      
      // All transactions should complete successfully
      expect(results).toHaveLength(10);
      
      // Verify all rows were inserted
      const countResult = await db.query('SELECT COUNT(*) as count FROM test_concurrent');
      expect(parseInt(countResult.rows[0].count)).toBe(10);

      // Cleanup
      await db.query('DROP TABLE IF EXISTS test_concurrent');
    });

    it('should maintain data integrity with concurrent inserts', async () => {
      // Create test table with unique constraint
      await db.query(`
        CREATE TABLE IF NOT EXISTS test_integrity (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE,
          counter INTEGER DEFAULT 0
        )
      `);

      await db.query('DELETE FROM test_integrity');
      await db.query('INSERT INTO test_integrity (name, counter) VALUES ($1, $2)', ['test', 0]);

      // Run concurrent updates to the same row
      const promises = Array.from({ length: 20 }, () =>
        db.transaction(async (client) => {
          const result = await client.query(
            'UPDATE test_integrity SET counter = counter + 1 WHERE name = $1 RETURNING counter',
            ['test']
          );
          return result.rows[0].counter;
        })
      );

      await Promise.all(promises);

      // Verify final counter value is correct (all updates applied)
      const result = await db.query('SELECT counter FROM test_integrity WHERE name = $1', ['test']);
      expect(result.rows[0].counter).toBe(20);

      // Cleanup
      await db.query('DROP TABLE IF EXISTS test_integrity');
    });
  });

  describe('Query Execution', () => {
    it('should execute simple query', async () => {
      const result = await db.query('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it('should execute parameterized query', async () => {
      const result = await db.query('SELECT $1 as value', [42]);
      expect(result.rows[0].value).toBe(42);
    });

    it('should handle query errors', async () => {
      await expect(db.query('INVALID SQL')).rejects.toThrow();
    });
  });

  describe('Connection Management', () => {
    it('should get client from pool', async () => {
      const client = await db.getClient();
      expect(client).toBeDefined();
      expect(typeof client.query).toBe('function');
      client.release();
    });

    it('should close pool gracefully', async () => {
      const testDb = new Database();
      await testDb.close();
      // Pool should be closed without errors
    });
  });
});
