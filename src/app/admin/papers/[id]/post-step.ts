// Calls one pipeline step on the server and returns its JSON, or throws with the server's message.
export async function postStep(url: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // A platform timeout returns an HTML page, not JSON.
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
