Backend folder structure for this project

- package.json
- server.js
- jobs/
- lib/
  - supabase.js
  - middleware/
  - normalizers/
  - routes/
  - services/
    - delivery.service.js
    - orders.service.js
    - products.service.js
    - workflow/
      - eventBus.js
      - workflow.registry.js
      - workflows/
        - order.workflow.js
