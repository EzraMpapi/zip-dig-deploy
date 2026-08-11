// src/smart/lib/startup.jsx
import { startClientServices } from "./clientServices.jsx";

// Run centralized client services at module load. This is idempotent and
// safe to import from multiple places. It ensures Supabase and the offline
// sync engine are configured and started exactly once.
startClientServices();
