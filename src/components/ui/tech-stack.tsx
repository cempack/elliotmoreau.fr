"use client";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { cn } from "@/lib/utils";
import { motion, MotionProps } from "framer-motion";
import { PlusCircle } from "lucide-react";
import Image from "next/image";
import NextIcon, { NextHeader } from "./icons/next-logo";
import ReactIcon, { ReactSpinningIcon } from "./icons/react-icon";
import TailwindIcon, { TailwindHeader } from "./icons/tailwind-icon";
import TsIcon, { TsHeader } from "./icons/typescript";

// Extend the MotionDivProps to include both HTML props and Motion props
type MotionDivProps = React.ComponentPropsWithoutRef<"div"> & MotionProps;

// Create a MotionDiv component with extended props
const MotionDiv = motion.div as React.FC<MotionDivProps>;

// TechStack component that renders the grid
export function TechStack() {
  return (
    <BentoGrid className="max-w-4xl mx-auto md:auto-rows-[20rem]">
      {items.map((item, i) => (
        <BentoGridItem
          key={i}
          title={item.title}
          description={item.description}
          header={item.header}
          className={cn("[&>p:text-lg]", item.className)}
          icon={item.icon}
        />
      ))}
    </BentoGrid>
  );
}

// Four component that handles motion-based items
const Four = () => {
  const first = {
    initial: {
      x: 20,
      rotate: -5,
    },
    hover: {
      x: 0,
      rotate: 0,
    },
  };
  const second = {
    initial: {
      x: -20,
      rotate: 5,
    },
    hover: {
      x: 0,
      rotate: 0,
    },
  };

  return (
    <MotionDiv
      initial="initial"
      animate="animate"
      whileHover="hover"
      className="flex flex-1 justify-center w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-row space-x-0 md:space-x-2 py-10 px-0 md:p-0"
    >
      <MotionDiv
        variants={first}
        className="h-full w-2/3 rounded-2xl bg-white p-4 dark:bg-black dark:border-white/[0.1] border border-neutral-200 flex flex-col items-center justify-center"
      >
        <Image
          src="/nodejs-logo.svg"
          alt="NodeJS"
          height="150"
          width="150"
          className="rounded-sm h-10 w-10"
        />
        <p className="sm:text-sm text-xs text-center font-semibold text-neutral-500 mt-4">
          JavaScript... Everywhere
        </p>
        <p className="border border-green-500 bg-green-50 dark:bg-red-900/20 text-green-600 text-xs rounded-full px-2 py-0.5 mt-4 text-nowrap">
          The OG
        </p>
      </MotionDiv>

      <MotionDiv className="h-full relative z-20 w-2/3 rounded-2xl bg-white p-4 dark:bg-black dark:border-white/[0.1] border border-neutral-200 flex flex-col items-center justify-center">
        <Image
          src="/postgres-logo.svg"
          alt="PostgreSQL"
          height="150"
          width="150"
          className="rounded-sm h-10 w-10"
        />
        <p className="sm:text-sm text-xs text-center font-semibold text-neutral-500 mt-4">
          PostgreSQL
        </p>
        <p className="border border-blue-500 bg-blue-50 dark:bg-green-900/20 text-blue-600 text-xs rounded-full px-2 py-0.5 mt-4 text-nowrap">
          🐘 + 💙
        </p>
      </MotionDiv>

      <MotionDiv
        variants={second}
        className="h-full w-2/3 rounded-2xl bg-white p-4 dark:bg-black dark:border-white/[0.1] border border-neutral-200 flex flex-col items-center justify-center"
      >
        <Image
          src="/drizzle-logo.svg"
          alt="Drizzle ORM"
          height="100"
          width="100"
          className="rounded-full h-16 w-16"
        />
        <p className="sm:text-sm text-xs text-center font-semibold text-neutral-500 mt-4">
          Drizzle
        </p>
        <p className="border border-yellow-300 bg-yellow-50 dark:bg-orange-900/20 text-yellow-400 text-xs rounded-full px-2 py-0.5 mt-4 text-nowrap">
          Light ⚡️
        </p>
      </MotionDiv>
    </MotionDiv>
  );
};

// List of tech stack items with their properties
const items = [
  {
    title: "React",
    description: (
      <span className="text-sm">
        The library for web and native user interfaces
      </span>
    ),
    header: <ReactSpinningIcon />,
    className: "md:col-span-1",
    icon: <ReactIcon className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Next.js",
    description: (
      <span className="text-sm">The best way to do backend with React</span>
    ),
    header: <NextHeader />,
    className: "md:col-span-1",
    icon: <NextIcon className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Tailwind CSS",
    description: (
      <span className="text-sm">The modern way to deal with CSS</span>
    ),
    header: <TailwindHeader />,
    className: "md:col-span-1",
    icon: <TailwindIcon className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Runtime, Database, ORM",
    description: (
      <span className="text-sm">The cherry on top of the stack</span>
    ),
    header: <Four />,
    className: "md:col-span-2",
    icon: <PlusCircle className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Typescript",
    description: <span className="text-sm">Javascript, with types.</span>,
    header: <TsHeader />,
    className: "md:col-span-1",
    icon: <TsIcon className="h-4 w-4 text-neutral-500" />,
  },
];

export default TechStack;
