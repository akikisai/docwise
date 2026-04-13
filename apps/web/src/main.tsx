import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./app.css";

const router = createRouter({
  routeTree,
  defaultErrorComponent: ({ error }) => (
    <div className="flex min-h-[100dvh] items-center justify-center p-8 text-center">
      <div>
        <p className="text-destructive font-semibold">エラーが発生しました</p>
        <p className="text-muted-foreground mt-2 text-sm">{error.message}</p>
      </div>
    </div>
  ),
  defaultNotFoundComponent: () => (
    <div className="flex min-h-[100dvh] items-center justify-center p-8 text-center">
      <div>
        <p className="text-foreground font-semibold">ページが見つかりません</p>
        <p className="text-muted-foreground mt-2 text-sm">お探しのページは存在しません</p>
      </div>
    </div>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
