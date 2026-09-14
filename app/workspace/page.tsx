import { redirect } from "next/navigation";

/**
 * The platform is currently operating as one cybersecurity workspace.
 * Retain this route only for old bookmarks and redirect them immediately.
 */
export default function WorkspacePage() {
  redirect("/");
}
