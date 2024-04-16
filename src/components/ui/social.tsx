import Image from "next/image";
import Link from "next/link";
import { Button } from "./button";

export default function Social({
  icon,
  href,
  name,
  followers,
}: {
  icon: string;
  href: string;
  name: string;
  followers?: Promise<string>;
}) {
  return (
    <Link href={href} target="_blank">
      <Button
        variant={"default"}
        className="rounded-full transition-all hover:scale-105 flex gap-2"
      >
        <Image
          src={`/${icon}`}
          alt={name}
          width={24}
          height={24}
          className="invert dark:invert-0"
        />{" "}
        {followers && <p className="text-base">{followers}</p>}
      </Button>
    </Link>
  );
}
