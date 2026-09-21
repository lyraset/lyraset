/**
 * Integrity checks applied at clock-in: is this request coming from the office
 * network, and is the phone actually at the office?
 *
 * Both are advisory. A failed check never silently blocks someone from
 * recording their day — it flags the record and, for an office-based employee
 * outside the geofence, routes the day to approvals as official duty. Pure
 * module so the rules can be unit-tested without a request.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToInt(ip) {
  const m = IPV4.exec(String(ip).trim());
  if (!m) return null;
  let total = 0;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(m[i]);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    total = total * 256 + octet;
  }
  return total;
}

function ipv6ToBigInt(ip) {
  const raw = String(ip).trim().toLowerCase();
  if (!raw.includes(':')) return null;
  // An IPv4-mapped address (::ffff:1.2.3.4) is compared as IPv6.
  const mapped = /^(.*:)((\d{1,3}\.){3}\d{1,3})$/.exec(raw);
  let text = raw;
  if (mapped) {
    const v4 = ipv4ToInt(mapped[2]);
    if (v4 == null) return null;
    const hi = (v4 >>> 16) & 0xffff;
    const lo = v4 & 0xffff;
    text = mapped[1] + hi.toString(16) + ':' + lo.toString(16);
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':').filter(Boolean) : []) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (fill < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;

  let total = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    total = (total << 16n) + BigInt(parseInt(group, 16));
  }
  return total;
}

/**
 * Is an IP inside a CIDR range? A bare address (no "/") is treated as a /32
 * or /128, so the Owner can allowlist a single static IP without knowing CIDR.
 */
export function ipInCidr(ip, cidr) {
  if (!ip || !cidr) return false;
  const [range, bitsRaw] = String(cidr).trim().split('/');

  const ipV4 = ipv4ToInt(ip);
  const rangeV4 = ipv4ToInt(range);
  if (ipV4 != null && rangeV4 != null) {
    const bits = bitsRaw == null ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    // >>> 0 keeps the mask unsigned; JS bitwise operators are signed 32-bit.
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipV4 & mask) >>> 0 === (rangeV4 & mask) >>> 0;
  }

  const ipV6 = ipv6ToBigInt(ip);
  const rangeV6 = ipv6ToBigInt(range);
  if (ipV6 != null && rangeV6 != null) {
    const bits = bitsRaw == null ? 128 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false;
    if (bits === 0) return true;
    const mask = ((1n << BigInt(bits)) - 1n) << BigInt(128 - bits);
    return (ipV6 & mask) === (rangeV6 & mask);
  }

  return false;
}

/** True when the IP matches any entry in the allowlist. An empty list allows everything. */
export function ipAllowed(ip, allowlist) {
  const list = (allowlist ?? []).filter(Boolean);
  if (!list.length) return true;
  return list.some((cidr) => ipInCidr(ip, cidr));
}

const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance in metres. Accurate enough at office scale. */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => !Number.isFinite(Number(v)))) return null;
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const dLat = toRad(lat2) - toRad(lat1);
  const dLng = toRad(lng2) - toRad(lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))));
}

/**
 * Is a reported position inside the office geofence?
 *
 * The phone's own accuracy estimate is added to the radius, because rejecting
 * someone standing in the office whose GPS is 60 m vague would be a bug, not a
 * policy. Returns `{ within: null }` when there is nothing to compare.
 */
export function withinGeofence(position, geofence, { accuracyM = null, maxAccuracyM = 500 } = {}) {
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const centreLat = Number(geofence?.lat);
  const centreLng = Number(geofence?.lng);
  if (![lat, lng, centreLat, centreLng].every(Number.isFinite)) {
    return { within: null, distanceM: null, reason: 'no-position' };
  }

  const distanceM = haversineMeters(lat, lng, centreLat, centreLng);
  const radius = Number(geofence?.radiusM) || 200;
  const slack = Number.isFinite(Number(accuracyM)) ? Math.min(Number(accuracyM), maxAccuracyM) : 0;
  return { within: distanceM <= radius + slack, distanceM, reason: null };
}
