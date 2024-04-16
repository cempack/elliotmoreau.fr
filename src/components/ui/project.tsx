import Image from "next/image";
import Link from "next/link";

export default function Project({
  name,
  href,
  icon,
}: {
  name: string;
  href: string;
  icon: string;
}) {
  return (
    <Link target="_blank" href={href} className="flex flex-row items-center">
      <Image
        src={icon}
        alt={name}
        className={`w-9 md:w-10 mr-1 ml-[-3px] md:mx-4 rounded-xl bg-secondary dark:bg-secondary-foreground p-1`}
        width={120}
        height={120}
      />
      <h1 className="text-sm md:text-lg text-bold text-gray-500 dark:text-gray-300">
        {name}
      </h1>
    </Link>
  );
}
