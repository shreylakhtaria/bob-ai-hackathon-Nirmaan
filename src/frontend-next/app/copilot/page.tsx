import { redirect } from "next/navigation";

// The copilot is a floating widget available on every page now, so this route
// exists only so old links and bookmarks still land somewhere sensible.
export default function CopilotPage() {
  redirect("/overview");
}
