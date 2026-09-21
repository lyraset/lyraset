import mongoose from "mongoose";

// If the CMS already has a connection helper, you can re-export it here instead.
const cached = (globalThis.__lyrWorkspaceMongoose ||= { conn: null, promise: null });

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  cached.promise ||= mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}
