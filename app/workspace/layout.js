import "@/styles/workspace.css";

export const metadata = {
  title: { default: "Workspace", template: "%s | LYRASET Workspace" },
  robots: { index: false, follow: false, nocache: true },
};

export default function WorkspaceRootLayout({ children }) {
  return <div className="ws-root">{children}</div>;
}
