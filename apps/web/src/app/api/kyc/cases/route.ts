export async function POST() {
  return Response.json(
    { error: "Use the secure evidence upload flow." },
    { status: 410 },
  );
}
