/** Browser-local choice. Viewing history never changes another user's active day. */
let batchId: string | null = null;
let version = 0;
let storageKey = "";
const listeners = new Set<() => void>();
export const workingDate = {
  batch: () => batchId,
  version: () => version,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  initialize(userId:string) {
    storageKey="sonacol.working-date:"+userId;
    try {batchId=localStorage.getItem(storageKey)||null;} catch {batchId=null;}
    this.refresh();
  },
  select(id: string | null) {
    batchId = id;
    try {if(storageKey){if(id)localStorage.setItem(storageKey,id);else localStorage.removeItem(storageKey);}} catch { /* Private browsing may disable storage. */ }
    this.refresh();
  },
  afterDeletion(ids: string[]) {
    if (batchId && ids.includes(batchId)) this.select(null);
    else this.refresh();
    try { localStorage.setItem("sonacol.imports-changed", String(Date.now())); } catch { /* No persistent browser storage. */ }
  },
  refresh() { version++; for (const listener of listeners) listener(); },
};
