export function readRequestId(request: Request) {
  const id = request.headers.get("Idempotency-Key");
  return id === null || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id?.toLowerCase() ?? null
    : false;
}
