import type { ReactNode } from "react";

import { ProductMotionProvider } from "@/components/app/product-motion-provider";
import { WorkspaceProvider } from "@/components/app/workspace-provider";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ProductMotionProvider>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </ProductMotionProvider>
  );
}
