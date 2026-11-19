# Architecture Rules

- Archive supplementary import orders as individual `app_data` records and merge them during initial sync, so a lost main-list write cannot erase user-entered orders.