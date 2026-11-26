# Architecture Rules

- Archive supplementary import orders as individual `app_data` records, keep a persistent IndexedDB snapshot and retry queue, and merge recoverable copies during sync so a lost main-list write cannot erase user-entered orders.