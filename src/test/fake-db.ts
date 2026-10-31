// A stand-in for the Supabase client in tests. Every query chain is recorded and
// answered by the test's `respond` function when awaited.
export interface Call {
  target: string; // table name, or "storage:<bucket>"
  ops: { method: string; args: unknown[] }[];
}
export type Reply = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

export function fakeDb(respond: (call: Call) => Reply, auth: object = {}) {
  const calls: Call[] = [];
  const chain = (target: string) => {
    const call: Call = { target, ops: [] };
    calls.push(call);
    const proxy: object = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === "then") {
            const reply = respond(call);
            const result = { data: null, error: null, ...reply };
            return (resolve: (r: unknown) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            call.ops.push({ method, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db = {
    from: (table: string) => chain(table),
    storage: { from: (bucket: string) => chain(`storage:${bucket}`) },
    auth,
  };
  return { db, calls };
}

export const op = (call: Call, method: string) => call.ops.find((o) => o.method === method);
