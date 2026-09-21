import mongoose from 'mongoose';

/**
 * Run a unit of work in a MongoDB transaction where the deployment supports
 * one, and fall back to running it without where it does not.
 *
 * Atlas (and any replica set) gives real transactions, which is what production
 * uses — the EOD and the clock-out it belongs to must land together or not at
 * all. A standalone mongod, which a developer may well be running locally,
 * rejects transactions outright; refusing to work there would make the portal
 * undevelopable for the sake of a guarantee that machine cannot offer anyway.
 *
 * `fn` receives a session (or null in fallback mode) and must pass it to every
 * write. The fallback path is only as safe as the caller's own compensation, so
 * callers that create more than one document clean up after themselves.
 */

/** Transactions unavailable: standalone server, or an older wire protocol. */
function isUnsupported(err) {
  if (!err) return false;
  if (err.code === 20 || err.code === 263) return true;
  const message = String(err.message ?? '');
  return (
    message.includes('Transaction numbers are only allowed') ||
    message.includes('Transactions are not supported') ||
    message.includes('replica set') ||
    message.includes('does not support sessions')
  );
}

let transactionsSupported = null;

export async function withTransaction(fn) {
  if (transactionsSupported === false) return fn(null);

  let session;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    if (!isUnsupported(err)) throw err;
    transactionsSupported = false;
    return fn(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    transactionsSupported = true;
    return result;
  } catch (err) {
    if (isUnsupported(err)) {
      transactionsSupported = false;
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

/** Spread into a Mongoose call to attach the session when there is one. */
export function withSession(session) {
  return session ? { session } : {};
}
