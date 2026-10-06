/**
 * framer-motion's DOM animation features, in their own module so the free
 * tools can load them after first paint (LazyMotion in tool-motion.tsx).
 * The tools sit above the fold on pages built to rank; shipping the full
 * animation library with their first load would cost Core Web Vitals.
 */
import { domAnimation } from "framer-motion"

export default domAnimation
