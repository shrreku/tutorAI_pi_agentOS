import { motion, useReducedMotion, type Variants } from "framer-motion";
import { createElement, type ReactNode } from "react";

/* ============================================================================
   Small, tasteful motion helpers used across the app. Respect reduced-motion.
   ============================================================================ */

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  once = true,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  if (reduce) return createElement(as, { className }, children);
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}

const STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
export const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export function Stagger({
  children,
  className,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={STAGGER}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={STAGGER_ITEM}>
      {children}
    </motion.div>
  );
}

/** A lift-on-hover wrapper for cards/tiles. */
export function Lift({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      {...(reduce
        ? {}
        : {
            whileHover: { y: -4 },
            transition: { type: "spring" as const, stiffness: 320, damping: 24 },
          })}
    >
      {children}
    </motion.div>
  );
}

export { motion, useReducedMotion };
