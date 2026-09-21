/**
 * Workspace database connection.
 *
 * The CMS already owns a cached Mongoose connection (lib/db.js). The workspace
 * reuses it rather than opening a second pool — Atlas connection limits are per
 * cluster, and two pools in one serverless container would double the cost of
 * every cold start for no benefit.
 */
import { connectToDatabase, isDbConfigured } from '../db.js';

export { isDbConfigured };

/** Connect to MongoDB (idempotent). Returns the shared Mongoose connection. */
export function connectDB() {
  return connectToDatabase();
}

export default connectDB;
