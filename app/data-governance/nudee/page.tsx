import { Suspense } from "react";
import NudeeRegister from "./NudeeRegister";

export default function NudeePage() {
  return <Suspense fallback={<p dir="rtl" role="status">جارٍ تحميل المتطلبات والأدلة…</p>}>
    <NudeeRegister />
  </Suspense>;
}
