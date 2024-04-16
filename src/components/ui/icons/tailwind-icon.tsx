import Image from "next/image";

export default function TailwindIcon({ className }: { className: string }) {
  return (
    <Image
      src={"/tailwind-logo.svg"}
      className={className}
      alt="Tailwind Logo"
      width={64}
      height={64}
    />
  );
}

export function TailwindHeader() {
  return (
    <div className="flex justify-center items-center">
      <Image
        className="w-[90%] mt-8 animate-pulse-slow"
        src={"/tailwind-logo.svg"}
        alt="Tailwind Logo"
        width={120}
        height={120}
      />
    </div>
  );
}
