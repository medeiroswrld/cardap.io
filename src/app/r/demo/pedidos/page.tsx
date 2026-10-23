import { TrackingPage } from "@/components/tracking";
import { DemoProvider } from "@/components/demo-provider";
export default function Page() {
  return (
    <DemoProvider>
      <TrackingPage />
    </DemoProvider>
  );
}
