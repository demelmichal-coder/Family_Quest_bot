// ConfettiReward.jsx - Animace konfet při splnění úkolu
import { motion, AnimatePresence } from "framer-motion";
import React from "react";

const confettiVariants = {
  initial: { opacity: 0, y: -50 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 10 } },
  exit: { opacity: 0, y: 50, transition: { duration: 0.5 } },
};

const confettiArray = Array.from({ length: 18 });

export default function ConfettiReward({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 pointer-events-none z-50 flex justify-center items-center">
          {confettiArray.map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-3xl select-none"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
                color: `hsl(${Math.random() * 360},90%,60%)`,
                rotate: Math.random() * 360,
              }}
              variants={confettiVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              🎉
            </motion.div>
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
