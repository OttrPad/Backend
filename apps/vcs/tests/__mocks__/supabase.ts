class MockSupabase {
  private tables: Record<string, any[]> = {
    Room_users: [],
    Commits: [],
    Milestones: [],
    Allowed_emails: [],
  };
  private counters: Record<string, number> = { Milestones: 1, Commits: 1 };

  private canonical(table: string): string {
    const t = table.toLowerCase();
    if (t === "commits") return "Commits";
    if (t === "milestones") return "Milestones";
    if (t === "room_users") return "Room_users";
    return table; // fallback to provided
  }

  from(table: string) {
    const self = this;
    const t = this.canonical(table);
    return {
      select(_cols?: string) {
        const rows = [...(self.tables[t] || [])];
        const replace = (items: any[]) => {
          rows.length = 0;
          rows.push(...items);
        };
        const api: any = {
          eq(col: string, val: any) {
            replace(rows.filter((r) => r[col] === val));
            return api;
          },
          neq(col: string, val: any) {
            replace(rows.filter((r) => r[col] !== val));
            return api;
          },
          order(_c: string, _o: any) {
            return api;
          },
          limit(_n: number) {
            const n = Math.max(0, _n);
            replace(rows.slice(0, n));
            return api;
          },
          single() {
            return { data: rows[0] || null, error: null } as any;
          },
          then: undefined,
          get data() {
            return rows;
          },
        };
        return api;
      },
      insert(payload: any[]) {
        const arr = (self.tables[t] = self.tables[t] || []);
        const enriched = payload.map((row) => {
          const copy = { ...row };
          if (t === "Milestones" && !copy.milestone_id) {
            copy.milestone_id = `milestone-${self.counters.Milestones++}`;
          }
          if (t === "Commits" && !copy.commit_id) {
            copy.commit_id = `commit-${self.counters.Commits++}`;
          }
          if (!copy.created_at) {
            copy.created_at = new Date().toISOString();
          }
          return copy;
        });
        arr.push(...enriched);
        const data = enriched.length === 1 ? enriched[0] : enriched;
        return {
          select() {
            return {
              single() {
                return { data, error: null } as any;
              },
            } as any;
          },
        } as any;
      },
      delete() {
        return {
          eq(col: string, val: any) {
            const before = self.tables[t] || [];
            self.tables[t] = before.filter((r) => r[col] !== val);
            return { error: null } as any;
          },
        } as any;
      },
    };
  }
}

export const supabase: any = new MockSupabase();
