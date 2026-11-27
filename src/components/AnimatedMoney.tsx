"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useI18n } from "@/i18n/client";
import { money } from "@/lib/format";

/** Dollar amount that rolls smoothly to each new value (odometer feel). */
export function AnimatedMoney({ value, className = "", prefix = "$" }: { value: number; className?: string; prefix?: string }) {
  const { locale } = useI18n();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${money(v, locale)}`);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.4, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}
