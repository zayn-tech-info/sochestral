import type { ReactNode } from "react";

import { ProductMotionProvider } from "@/components/app/product-motion-provider";
import { ToastProvider } from "@/components/app/toast-provider";
import { WorkspaceProvider } from "@/components/app/workspace-provider";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ProductMotionProvider>
      <ToastProvider>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </ToastProvider>
    </ProductMotionProvider>
  );
}
