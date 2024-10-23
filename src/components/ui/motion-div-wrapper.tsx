import { motion, MotionProps } from "framer-motion";
import React from "react";

// DivProps includes standard HTML attributes for a div
type DivProps = React.HTMLAttributes<HTMLDivElement>;
type MergedProps = Omit<DivProps, keyof MotionProps> & MotionProps;

interface MotionDivWrapperProps extends MergedProps {
  style?: React.CSSProperties; // Use style instead of className
  children: React.ReactNode;
}

const MotionDivWrapper = ({
  style,
  children,
  ...props
}: MotionDivWrapperProps) => {
  return (
    <motion.div style={style} {...props}>
      {children}
    </motion.div>
  );
};

export default MotionDivWrapper;
