// ================================================================
// *** STORAGE — طبقة تخزين (D1 + KV, Phase 2+) ***
// ================================================================
// حالياً: وهمية (in-memory) — للاستبدال بـ D1 لاحقاً

const memoryStore = new Map();

export function createStorage(env) {
  const useD1 = !!env.DB;

  return {
    async save(id, data) {
      if (useD1) {
        await env.DB.prepare(
          'INSERT INTO lessons (id, data, created_at) VALUES (?, ?, ?)'
        ).bind(id, JSON.stringify(data), data.createdAt).run();
        return;
      }
      memoryStore.set(id, {
        data,
        savedAt: Date.now()
      });
    },

    async get(id) {
      if (useD1) {
        const result = await env.DB.prepare(
          'SELECT data FROM lessons WHERE id = ?'
        ).bind(id).first();
        return result ? JSON.parse(result.data) : null;
      }
      const entry = memoryStore.get(id);
      return entry ? entry.data : null;
    },

    async delete(id) {
      if (useD1) {
        await env.DB.prepare('DELETE FROM lessons WHERE id = ?').bind(id).run();
        return;
      }
      memoryStore.delete(id);
    },

    async list(limit = 50, offset = 0) {
      if (useD1) {
        const result = await env.DB.prepare(
          'SELECT id, created_at FROM lessons ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset).all();
        return result.results || [];
      }
      return [...memoryStore.entries()]
        .slice(offset, offset + limit)
        .map(([id, entry]) => ({
          id,
          createdAt: entry.data.createdAt
        }));
    },

    getStats() {
      return { size: memoryStore.size, type: useD1 ? 'D1' : 'memory' };
    }
  };
}
