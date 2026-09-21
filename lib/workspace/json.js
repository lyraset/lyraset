/**
 * Read a JSON request body without throwing on malformed input.
 * A null body flows into zod, which produces the field-level error message.
 */
export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
