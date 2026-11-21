const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const response = await fetch(`${backendUrl}/api/ask`, {
    method: "POST",
    headers: {
      Authorization: request.headers.get("authorization") ?? "",
      "Content-Type": "application/json",
    },
    body: await request.text(),
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
