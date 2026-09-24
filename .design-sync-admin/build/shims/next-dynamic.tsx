// design-sync shim for `next/dynamic`. RichTextEditor is exported as
// `dynamic(() => import("./rich-text-editor").then(m => m.RichTextEditor),
// { ssr: false })`. esbuild inlines that import() into the IIFE, so a
// React.lazy + Suspense wrapper is enough: same component, same `loading`.
import * as React from "react";

type Loaded<P> = React.ComponentType<P> | { default: React.ComponentType<P> };
type Options = { ssr?: boolean; loading?: React.ComponentType };

export default function dynamic<P extends object>(
  loader: () => Promise<Loaded<P>>,
  options: Options = {},
): React.ComponentType<P> {
  const Lazy = React.lazy(async () => {
    const m = await loader();
    return {
      default: "default" in m ? m.default : (m as React.ComponentType<P>),
    };
  });
  const Loading = options.loading;
  function DynamicComponent(props: P) {
    return (
      <React.Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...(props as P & React.JSX.IntrinsicAttributes)} />
      </React.Suspense>
    );
  }
  return DynamicComponent;
}
